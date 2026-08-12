#!/usr/bin/env python3
"""
Pre-live STT quality check — run before wiring conversational voice into demos.

Usage (from engine/):
  ALMA_STT_PROVIDER=demo python scripts/test_stt.py
  python scripts/test_stt.py path/to/sample_en.wav path/to/sample_sw.wav

Requires OPENAI_API_KEY when ALMA_STT_PROVIDER=openai (default).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow `python scripts/test_stt.py` from engine/
_ENGINE = Path(__file__).resolve().parent.parent
if str(_ENGINE) not in sys.path:
    sys.path.insert(0, str(_ENGINE))

from dotenv import load_dotenv

load_dotenv(_ENGINE.parent / ".env")
load_dotenv(_ENGINE / ".env")

from services import speech_to_text


def _run(path: Path, lang: str) -> None:
    print(f"\n--- {path.name} (lang={lang}) ---")
    result = speech_to_text.transcribe_file(path, lang_hint=lang)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    flag = "LOW CONFIDENCE → would trigger scripted fallback" if speech_to_text.is_low_confidence(result) else "OK for Gemma"
    print(f"Decision: {flag}")


def main() -> int:
    print("STT health:", json.dumps(speech_to_text.health(), indent=2))

    args = [Path(a) for a in sys.argv[1:]]
    if not args:
        # Demo mode smoke test without audio files
        result = speech_to_text.transcribe_bytes(b"fake", lang_hint="sw", filename="demo.wav")
        print("\n--- demo bytes ---")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print(
            "\nPass audio file paths to test real recordings, e.g.:\n"
            "  python scripts/test_stt.py samples/question_en.wav samples/question_sw.wav"
        )
        return 0

    for i, p in enumerate(args):
        lang = "sw" if "sw" in p.stem.lower() else "en"
        if not p.is_file():
            print(f"Skip missing file: {p}")
            continue
        _run(p, lang)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
