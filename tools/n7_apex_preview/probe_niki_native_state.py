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
if __name__=="__main__":main()
