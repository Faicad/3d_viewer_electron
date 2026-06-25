#!/usr/bin/env python3
"""Spark-TTS wrapper — single-segment generation.

Usage:
  # Voice cloning (requires reference WAV)
  python sparktts_tts.py --voice ref.wav --text "你好" --output out.wav

  # Voice creation (generate from attributes, no reference needed)
  python sparktts_tts.py --gender female --pitch moderate --speed moderate --text "你好" --output out.wav
"""
import argparse
import json
import os
import sys
import warnings

# Suppress noisy library warnings from polluting stdout
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("BITSANDBYTES_NOWELCOME", "1")
warnings.filterwarnings("ignore")

import librosa
import soundfile as sf
import torch


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def resolve_model_dir(model_dir):
    if model_dir:
        return model_dir
    default = os.path.join(SCRIPT_DIR, "pretrained_models/Spark-TTS-0.5B")
    if os.path.isfile(os.path.join(default, "config.yaml")):
        return default
    print(f"Model not found at {default}, downloading...", file=sys.stderr)
    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
    from huggingface_hub import snapshot_download
    snapshot_download("SparkAudio/Spark-TTS-0.5B", local_dir=default)
    return default


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", help="Reference voice WAV for voice cloning")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--output", required=True, help="Output WAV path")
    parser.add_argument("--model-dir", help="Path to model checkpoints")
    parser.add_argument("--gender", choices=["male", "female"], help="Voice gender (voice creation mode)")
    parser.add_argument("--pitch", choices=["very_low", "low", "moderate", "high", "very_high"], help="Pitch level")
    parser.add_argument("--speed", choices=["very_low", "low", "moderate", "high", "very_high"], help="Speed level")
    args = parser.parse_args()

    if not args.voice and not args.gender:
        print("ERROR: either --voice (voice cloning) or --gender (voice creation) is required", file=sys.stderr)
        sys.exit(1)

    if args.voice and not os.path.isfile(args.voice):
        print(f"ERROR: Reference voice not found: {args.voice}", file=sys.stderr)
        sys.exit(1)

    model_dir = resolve_model_dir(args.model_dir)
    from spark_tts_lib import SparkTTS

    tts = SparkTTS(model_dir=model_dir, device=torch.device("cpu"))

    try:
        wav = tts.inference(
            text=args.text,
            prompt_speech_path=args.voice,
            gender=args.gender,
            pitch=args.pitch,
            speed=args.speed,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if isinstance(wav, torch.Tensor):
        wav = wav.squeeze().cpu()
    else:
        wav = torch.from_numpy(wav).squeeze()
    out_dir = os.path.dirname(args.output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    sf.write(args.output, wav.numpy(), tts.sample_rate)

    try:
        audio, sr = librosa.load(args.output, sr=None)
        duration = len(audio) / sr
    except Exception as e:
        print(f"WARN: cannot probe duration: {e}", file=sys.stderr)
        duration = 0

    print(json.dumps({"path": args.output, "duration": round(duration, 3)}))


if __name__ == "__main__":
    main()
