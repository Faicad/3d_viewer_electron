import os, subprocess, sys
from pathlib import Path

FFMPEG = Path(os.environ.get("FFMPEG_PATH") or r"C:\USERS\YUAN_\APPDATA\LOCAL\MICROSOFT\WINGET\PACKAGES\GYAN.FFMPEG_MICROSOFT.WINGET.SOURCE_8WEKYB3D8BBWE\FFMPEG-7.1-FULL_BUILD\BIN\ffmpeg.exe")
OUT = Path(r"C:\tmp")

def extract_first_frame(video_path: str) -> Path:
    video = Path(video_path)
    if not video.exists():
        raise FileNotFoundError(f"File not found: {video}")
    out = OUT / f"{video.stem}_first_frame.png"
    subprocess.run(
        [str(FFMPEG), "-y", "-i", str(video), "-vframes", "1", str(out)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    return out

def preview(path: Path):
    from PIL import Image
    Image.open(path).show()

def main():
    if len(sys.argv) < 2:
        print("Usage: python extras/first_frame.py <video_file>")
        sys.exit(1)
    out = extract_first_frame(sys.argv[1])
    print(f"First frame saved to: {out}")
    preview(out)

if __name__ == "__main__":
    main()
