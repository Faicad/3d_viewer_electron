"""
Run easyocr on a screenshot to find text coordinates.
Output JSON to stdout with found text coordinates.

Usage:
  python movies/easyocr-mark.py <screenshot.png> <text1> [text2 ...]

Output (stdout):
  {"text1": {"x": 100, "y": 200, "w": 50, "h": 20, "fullY": 200}, ...}
"""

import sys, json
import cv2
import numpy as np
import easyocr
from difflib import SequenceMatcher

_reader = None

def get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["ch_sim", "en"], gpu=True, verbose=False)
    return _reader


def text_match_score(query, ocr_text):
    q = query.lower().strip()
    t = ocr_text.lower().strip()
    if not q or not t:
        return 0
    if q in t:
        return 1.0
    if t in q and len(t) >= max(2, len(q) * 0.6):
        return 0.8
    q_chars = set(q)
    t_chars = set(t)
    char_overlap = len(q_chars & t_chars) / len(q_chars) if q_chars else 0
    sm = SequenceMatcher(None, q, t)
    match_len = sm.find_longest_match(0, len(q), 0, len(t)).size
    if match_len / len(q) < 0.5:
        return 0
    return char_overlap * 0.7 + sm.ratio() * 0.3


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python easyocr-mark.py <screenshot.png> <text1> [text2 ...]"}))
        sys.exit(1)

    img_path = sys.argv[1]
    texts = sys.argv[2:]

    img = cv2.imread(img_path)
    if img is None:
        print(json.dumps({"error": f"cannot read {img_path}"}))
        sys.exit(1)

    reader = get_reader()

    # Scale up small images
    h_img, w_img = img.shape[:2]
    scale = 1
    search_img = img
    min_dim = min(h_img, w_img)
    if min_dim < 500:
        scale = 500 // min_dim + 1
        search_img = cv2.resize(img,
                                (w_img * scale, h_img * scale),
                                interpolation=cv2.INTER_CUBIC)

    # Multi-pass OCR
    ocr_results = []
    seen_texts = set()

    def do_pass(image, label):
        nonlocal ocr_results
        results = reader.readtext(image, detail=1)
        for bbox, txt, conf in results:
            if txt.lower() in seen_texts:
                continue
            seen_texts.add(txt.lower())
            x1, y1 = int(bbox[0][0]), int(bbox[0][1])
            x2, y2 = int(bbox[2][0]), int(bbox[2][1])
            bw, bh = x2 - x1, y2 - y1
            if bw <= 0 or bh <= 0:
                continue
            sx, sy = x1 // scale, y1 // scale
            sbw, sbh = bw // scale, bh // scale
            ocr_results.append((sx, sy, sbw, sbh, conf, txt, label))

    do_pass(search_img, "original")

    # CLAHE enhancement
    gray = cv2.cvtColor(search_img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray_enh = clahe.apply(gray)
    enhanced = cv2.cvtColor(gray_enh, cv2.COLOR_GRAY2BGR)
    do_pass(enhanced, "clahe")

    # Inverted for dark backgrounds
    gray_inv = cv2.bitwise_not(gray)
    inverted = cv2.cvtColor(gray_inv, cv2.COLOR_GRAY2BGR)
    do_pass(inverted, "inverted")

    # Match texts
    result = {}
    for text in texts:
        best = None
        best_score = 0
        for sx, sy, sbw, sbh, conf, ocr_txt, label in ocr_results:
            score = text_match_score(text, ocr_txt)
            if score >= 0.6 and score > best_score:
                # Title bar penalty
                title_penalty = 0.3 if sy < 30 else 0
                combined = score * 0.7 + conf * 0.3 - title_penalty
                if combined > best_score:
                    best_score = combined
                    best = (sx, sy, sbw, sbh, conf, ocr_txt)

        if best:
            sx, sy, sbw, sbh, conf, ocr_txt = best
            result[text] = {
                "x": sx, "y": sy, "w": sbw, "h": sbh, "fullY": sy,
            }
            print(f"  '{text}' -> OCR '{ocr_txt}' at ({sx},{sy}) {sbw}x{sbh} conf={conf:.2f}",
                  file=sys.stderr)
        else:
            print(f"  Warning: '{text}' not found", file=sys.stderr)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
