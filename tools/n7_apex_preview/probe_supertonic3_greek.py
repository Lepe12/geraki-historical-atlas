#!/usr/bin/env python3
"""Read-only Greek Supertonic 3 TTS feasibility probe: does not touch N7 production."""
import json
import os
import sys
from pathlib import Path

import numpy as np
from supertonic import TTS

SAMPLE_RATE = 44100
SENTENCES = [
    "Καλημέρα. Είμαι ο Ν7. Ας δούμε τι χρειάζεται πραγματικά να γίνει.",
    "Η έρευνα για την επιδρομή στην Ιεράπετρα χρειάζεται δεύτερη ανεξάρτητη πηγή.",
    "Το αποτέλεσμα δεν επαληθεύτηκε ακόμη. Δεν θα ισχυριστώ ότι ολοκληρώθηκε.",
    "Σήμερα θα ελέγξω πρώτα τα προβλήματα και μετά θα προτείνω λύση.",
]

def main():
    output = Path(os.environ.get("N7_VOICE_TEST_OUTPUT", "/tmp/n7-supertonic3-greek"))
    output.mkdir(parents=True, exist_ok=True)
    print("N7_VOICE_PROBE_START model=supertonic-3 lang=el voice=F1", flush=True)
    tts = TTS(auto_download=True)
    female = tts.get_voice_style(voice_name="F1")
    outcomes = []
    for i, sentence in enumerate(SENTENCES):
        audio, duration = tts.synthesize(
            text=sentence, lang="el", voice_style=female,
            total_steps=8, speed=1.0,
        )
        wav = np.asarray(audio, dtype=np.float32).reshape(-1)
        if wav.size < SAMPLE_RATE // 3:
            raise RuntimeError("N7_GREEK_VOICE_NO_AUDIO sample_" + str(i))
        if not np.isfinite(wav).all():
            raise RuntimeError("N7_GREEK_VOICE_NONFINITE sample_" + str(i))
        rms = float(np.sqrt(np.mean(wav * wav)))
        peak = float(np.max(np.abs(wav)))
        if rms < 0.001 or peak > 1.1:
            raise RuntimeError("N7_GREEK_VOICE_AUDIO_INVALID sample_" + str(i))
        target = output / f"n7-greek-{i+1:02d}.wav"
        tts.save_audio(audio, str(target))
        if target.stat().st_size < 1000:
            raise RuntimeError("N7_GREEK_VOICE_EMPTY_WAV sample_" + str(i))
        metrics = {"sample": i+1, "chars": len(sentence), "seconds": round(wav.size/SAMPLE_RATE,2), "rms": round(rms,4), "peak": round(peak,4), "wav_bytes": target.stat().st_size}
        outcomes.append(metrics)
        print("N7_VOICE_SAMPLE_PASS " + json.dumps(metrics,ensure_ascii=False),flush=True)
    print("N7_SUPERTONIC3_GREEK_AUDIO_PASS " + json.dumps({"samples":len(outcomes),"lang":"el","voice":"F1","sample_rate":SAMPLE_RATE},ensure_ascii=False),flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("N7_SUPERTONIC3_GREEK_AUDIO_FAIL " + type(exc).__name__ + ": " + str(exc)[:180], file=sys.stderr, flush=True)
        raise
