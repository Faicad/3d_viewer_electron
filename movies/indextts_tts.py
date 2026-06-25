#!/usr/bin/env python3
"""IndexTTS2 TTS wrapper — single-segment generation.

Usage:
  python indextts_tts.py --voice ref.wav --text "你好" --output out.wav
"""
import argparse
import json
import os
import sys
import time

import librosa


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True, help="Reference voice WAV file for voice cloning")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--output", required=True, help="Output WAV path")
    parser.add_argument("--model-dir", help="Path to model checkpoints (auto-download if omitted)")
    args = parser.parse_args()

    if not os.path.isfile(args.voice):
        print(f"ERROR: Reference voice not found: {args.voice}", file=sys.stderr)
        sys.exit(1)

    # defer import so --help is fast
    from indextts import IndexTTS2

    tts = IndexTTS2(
        model_dir=args.model_dir,
        use_fp16=False,
        use_cuda_kernel=False,
    )

    try:
        tts.infer(
            spk_audio_prompt=args.voice,
            text=args.text,
            output_path=args.output,
            verbose=False,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    # probe duration with librosa (avoids ffprobe dep)
    try:
        audio, sr = librosa.load(args.output, sr=None)
        duration = len(audio) / sr
    except Exception as e:
        print(f"WARN: cannot probe duration: {e}", file=sys.stderr)
        duration = 0

    # print JSON result for Node.js to parse
    print(json.dumps({"path": args.output, "duration": round(duration, 3)}))


if __name__ == "__main__":
    main()
