#!/usr/bin/env python3
"""edge-tts wrapper with word boundary timestamps.

Outputs JSON to stdout with format:
  {"path": "...", "duration": 3.14, "words": [{"text": "...", "offset": ..., "duration": ...}, ...]}
"""
import argparse
import asyncio
import json
import os
import sys

import edge_tts


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural", help="TTS voice")
    parser.add_argument("--output", required=True, help="Output MP3 path")
    args = parser.parse_args()

    out_dir = os.path.dirname(args.output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    words = []
    communicate = edge_tts.Communicate(
        args.text,
        args.voice,
        boundary='WordBoundary',
    )

    audio_data = b''
    async for chunk in communicate.stream():
        if chunk['type'] == 'WordBoundary':
            words.append({
                'text': chunk['text'],
                'offset': chunk['offset'],
                'duration': chunk['duration'],
            })
        elif chunk['type'] == 'audio':
            audio_data += chunk['data']

    with open(args.output, 'wb') as f:
        f.write(audio_data)

    if words:
        duration = max(w['offset'] + w['duration'] for w in words) / 10_000_000
    else:
        duration = 0

    result = {
        'path': args.output,
        'duration': round(duration, 3),
        'words': words,
    }
    # Write raw UTF-8 bytes to avoid Windows code-page mangling
    sys.stdout.buffer.write(
        json.dumps(result, ensure_ascii=False).encode('utf-8') + b'\n')


if __name__ == '__main__':
    asyncio.run(main())
