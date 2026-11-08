"""N7 private corpus: actual AES-GCM tamper tests and manifest identity fixtures."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

from n7_private_corpus_store import checked_run, handoffs_on_disk, private_visibility_check, decode_private_answer, crypt, digest
from research_lane_handoff import pack, LANES

NODE=Path(__file__).with_name("n7_private_aead.js")


class N7PrivateCorpusTests(unittest.TestCase):
    def test_aead_roundtrip_no_plaintext_leak_and_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            plain=b"PRIVATE_NAXOS_SOURCE_1670\n" * 100
            a=root/"plain";a.write_bytes(plain)
            k=root/"key";k.write_bytes(bytes(range(32)))
            encrypted=root/"encrypted";output=root/"restored"
            def run(mode,src,dest,purpose="research:42434462262:greek:archive"):
                return subprocess.run(["node",str(NODE),mode,str(src),str(dest),str(k),purpose],
                                      capture_output=True,text=True,timeout=10)
            step=run("seal",a,encrypted)
            self.assertEqual(step.returncode,0,step.stderr)
            self.assertNotIn(plain[:30],encrypted.read_bytes())
            step=run("open",encrypted,output)
            self.assertEqual(step.returncode,0,step.stderr)
            self.assertEqual(output.read_bytes(),plain)
            corrupted=bytearray(encrypted.read_bytes())
            corrupted[-17]^=1
            broken=root/"corrupted";broken.write_bytes(corrupted)
            step=run("open",broken,root/"not_created")
            self.assertNotEqual(step.returncode,0)
            self.assertFalse((root/"not_created").exists())
            step=run("open",encrypted,root/"wrong_purpose",
                     "research:42434462262:ott om an:archive")
            self.assertNotEqual(step.returncode,0)
            step=run("open",encrypted,root/"wrong_lane","research:42434462262:ottoman:archive")
            self.assertNotEqual(step.returncode,0)

    def test_run_id_must_be_numeric_and_bounded(self):
        self.assertEqual(checked_run("42434462262"),"42434462262")
        for bad in ("../../etc","0","4243","A"*20,"1"*30,"42434462262/../main"):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                checked_run(bad)

    def test_handoff_verification_rejects_cross_run_and_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            src=root/"evidence/runs/42434462262/greek"
            src.mkdir(parents=True)
            (src/"index.json").write_text('{"historically_verified":false}')
            folder=root/"lane_handoffs/pct-lane-handoff-42434462262-greek"
            pack(root,"42434462262","greek",folder)
            # The others are missing: no partial activation.
            with self.assertRaisesRegex(RuntimeError,"N7_MISSING_PRIVATE_HANDOFF"):
                handoffs_on_disk("42434462262",root/"lane_handoffs")
            with (folder/"manifest.json").open("r+",encoding="utf-8") as stream:
                obj=json.load(stream)
                obj["run_id"]="99999999999"
                stream.seek(0);json.dump(obj,stream);stream.truncate()
            from research_lane_handoff import validate
            with self.assertRaisesRegex(ValueError,"LANE_HANDOFF_BINDING_MISMATCH"):
                validate(folder,"42434462262",LANES)

    def test_public_path_denied_required(self):
        def not_found(*args,**kwargs):
            raise urllib.error.HTTPError("https://example",404,"not found",{},None)
        with patch("n7_private_corpus_store.urllib.request.urlopen",side_effect=not_found):
            private_visibility_check("42434462262")
        class Public:
            def __enter__(self):return self
            def __exit__(self,*args):return False
            status=200
        with patch("n7_private_corpus_store.urllib.request.urlopen",return_value=Public()):
            with self.assertRaisesRegex(RuntimeError,"PRIVATE_DATA_PATH_PUBLICLY_ACCESSIBLE"):
                private_visibility_check("42434462262")


    def test_encrypted_answer_restore_enforces_run_sha_and_verification(self):
        run_id="42434462262"
        secret=bytes(range(32))
        original=json.dumps({
            "schema":"pct-semantic-answer-v3",
            "status":"NO_MODEL_SUPPORTED_CLAIMS",
            "claims":[{"claim_id":"c1","quote":"Original Naxos passage"}],
            "historically_verified":False,"verified":False
        }).encode()
        sealed=crypt("seal",original,secret,"research:"+run_id+":answer")
        receipt={"schema":"n7-private-answer-index-v1","run_id":run_id,
                 "sealed_sha256":digest(sealed),"historically_verified":False}
        restored,answer=decode_private_answer(receipt,sealed,secret,run_id)
        self.assertEqual(restored,original)
        self.assertEqual(answer["status"],"NO_MODEL_SUPPORTED_CLAIMS")
        with self.assertRaisesRegex(RuntimeError,"INDEX_OR_SHA_INVALID"):
            decode_private_answer(receipt,sealed+b"x",secret,run_id)
        with self.assertRaisesRegex(RuntimeError,"INDEX_OR_SHA_INVALID"):
            decode_private_answer(receipt,sealed,secret,"99999999999")
        receipt["sealed_sha256"]=digest(sealed)
        bad=json.dumps({"status":"REVIEWED","claims":[],"verified":True}).encode()
        illegal=crypt("seal",bad,secret,"research:"+run_id+":answer")
        receipt["sealed_sha256"]=digest(illegal)
        with self.assertRaisesRegex(RuntimeError,"PRIVATE_PREVIOUS_ANSWER_UNSAFE"):
            decode_private_answer(receipt,illegal,secret,run_id)


if __name__=="__main__":
    unittest.main()
