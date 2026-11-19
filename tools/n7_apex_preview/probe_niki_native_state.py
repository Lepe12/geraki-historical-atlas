#!/usr/bin/env python3
"""Inspect Pocket Greek native voice state for verified Niki -> PKV1 browser export."""
import io, json, hashlib, urllib.request, struct
from pocket_tts import TTSModel
URL="https://raw.githubusercontent.com/Lepe12/geraki-historical-atlas/assets/n7-niki-cc0-20261119/tools/n7_apex_preview/n7-voice-assets/niki/pocket_ref.wav"
SHA="f9c67aa1d2951e6338af84245c1770e070cb6bc85960a6f249f7d7bf4357c3e0"
def main():
    raw=urllib.request.urlopen(URL,timeout=60).read()
    assert hashlib.sha256(raw).hexdigest()==SHA
    with __import__('tempfile').TemporaryDirectory() as td:
        path=__import__('pathlib').Path(td)/"niki.wav";path.write_bytes(raw)
        m=TTSModel.load_model(config="hf://myned-ai/pocket-tts-greek/greek.yaml")
        s=m.get_state_for_audio_prompt(str(path))
        out={}
        for module,values in s.items():
            out[module]={key:{"shape":list(t.shape),"dtype":str(t.dtype),"min":float(t.float().min()) if t.numel() else 0,"max":float(t.float().max()) if t.numel() else 0} for key,t in values.items()}
        print("N7_NIKI_NATIVE_KV_STATE "+json.dumps(out),flush=True)
        print("N7_NIKI_NATIVE_CONFIG "+json.dumps({"layers":getattr(m.flow_lm,"num_layers",None),"modules":len(s)}),flush=True)
        from pathlib import Path
        import torch
        rows=None
        header=None
        cache=[]
        for layer in range(6):
            x=s["transformer.layers.%d.self_attn"%layer]
            t=x["cache"].detach().cpu()
            if t.ndim!=5 or t.shape[:2]!=(2,1):
                raise RuntimeError("N7_NIKI_BAD_KV_DIMENSIONS")
            _,_,this_rows,heads,dim=t.shape
            step=int(x["offset"].reshape(-1)[0])
            if step!=this_rows:raise RuntimeError("N7_NIKI_KV_OFFSET_MISMATCH")
            if rows is None:rows=this_rows;header=(6,rows,heads,dim)
            if (6,this_rows,heads,dim)!=header:raise RuntimeError("N7_NIKI_KV_LAYER_MISMATCH")
            for kind in range(2):
                values=t[kind,0].permute(1,0,2).contiguous().to(torch.float16).numpy()
                cache.append(values.astype("<f2",copy=False).tobytes(order="C"))
        content=b"PKV1"+struct.pack("<IIII",*header)+b"".join(cache)
        assert len(content)==20+6*2*rows*heads*dim*2
        target=Path(__import__('os').environ.get("N7_NIKI_KV_PATH","/tmp/n7-niki-pocket-voice.bin"))
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(content)
        print("N7_NIKI_PKVOICE_PREPARED "+json.dumps({"sha256":hashlib.sha256(content).hexdigest(),"bytes":len(content),"header":header,"output":str(target)}),flush=True)
if __name__=="__main__":main()
