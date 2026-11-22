#!/usr/bin/env python3
"""Independent CPU-only native-Greek voice feasibility test; never deploys production assets."""
import json
import os
import sys
import time
import wave
from pathlib import Path

import numpy as np
from pocket_tts import TTSModel

VOICES = ("eleni", "athina", "katerina")
SENTENCES = (
    "Καλημέρα. Είμαι ο Ν επτά. Πάμε να λύσουμε το πρόβλημα με τον πιο απλό τρόπο.",
    "Η επιδρομή στην Ιεράπετρα χρειάζεται μία δεύτερη ανεξάρτητη ιστορική πηγή.",
)
CONFIG = "hf://myned-ai/pocket-tts-greek/greek.yaml"

def main():
    out = Path(os.getenv("N7_VOICE_TEST_OUTPUT", "/tmp/n7-native-greek-samples"))
    out.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    print("N7_GREEK_NATIVE_PROBE_START",flush=True)
    model = TTSModel.load_model(config=CONFIG)
    rate = int(model.sample_rate)
    assert 10000 <= rate <= 48000, rate
    print("N7_GREEK_NATIVE_MODEL_LOADED rate=" + str(rate) + " seconds=" + str(round(time.monotonic()-started,2)),flush=True)
    samples=[]
    for voice in VOICES:
        s=time.monotonic()
        style=model.get_state_for_audio_prompt("hf://myned-ai/pocket-tts-greek/voices/"+voice+".wav")
        for n,sentence in enumerate(SENTENCES,1):
            t=time.monotonic()
            audio=model.generate_audio(style, sentence)
            if hasattr(audio,"detach"): audio=audio.detach().cpu().numpy()
            pcm=np.asarray(audio,dtype=np.float32).reshape(-1)
            if pcm.size < rate//2 or not np.all(np.isfinite(pcm)):
                raise RuntimeError("N7_GREEK_NATIVE_INVALID_AUDIO "+voice+str(n))
            peak=float(np.max(np.abs(pcm)))
            rms=float(np.sqrt(np.mean(pcm*pcm)))
            if peak>1.1 or rms<0.0008: raise RuntimeError("N7_GREEK_NATIVE_BAD_LEVEL "+voice+str(n))
            pcm16=(np.clip(pcm,-1,1)*32767).astype("<i2")
            dest=out/f"{voice}-{n}.wav"
            with wave.open(str(dest),"wb") as wav:
                wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(pcm16.tobytes())
            row={"voice":voice,"sample":n,"seconds":round(pcm.size/rate,2),"generation_seconds":round(time.monotonic()-t,2),"rms":round(rms,4),"peak":round(peak,4),"size":dest.stat().st_size}
            samples.append(row)
            print("N7_GREEK_NATIVE_SAMPLE_PASS "+json.dumps(row,ensure_ascii=False),flush=True)
        print("N7_GREEK_NATIVE_VOICE_PASS name="+voice+" elapsed="+str(round(time.monotonic()-s,2)),flush=True)
    print("N7_GREEK_NATIVE_PROBE_PASS "+json.dumps({"model":"myned-ai/pocket-tts-greek","voice_count":len(VOICES),"samples":len(samples),"sample_rate":rate,"total_seconds":round(time.monotonic()-started,2)}),flush=True)

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("N7_GREEK_NATIVE_PROBE_FAIL "+type(exc).__name__+" "+str(exc)[:250],file=sys.stderr,flush=True)
        raise
