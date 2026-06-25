"""
在截图上用 EasyOCR 找到指定文字并画红色椭圆标记 + 数字。

与 mark-text.py 接口兼容，使用 EasyOCR 替代 Tesseract。
EasyOCR 对中英文混合文字的识别率通常优于 Tesseract。

用法:
  python movies/mark-text-easyocr.py <截图.png> "文字1:区域" "文字2:区域" ...

输出: {截图}_marked.png
"""

import sys, os, re, json, argparse
import cv2
import numpy as np
import easyocr

# 全局 reader（延迟初始化，复用实例）
_reader = None


def get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["ch_sim", "en"], gpu=True)
    return _reader


NAMED_REGIONS = {
    "left":            lambda w, h: (0, 0, w // 4, h),
    "right":           lambda w, h: (w * 3 // 4, 0, w // 4 + 1, h),
    "top":             lambda w, h: (0, 0, w, h // 4),
    "bottom":          lambda w, h: (0, h * 3 // 4, w, h // 4 + 1),
    "center":          lambda w, h: (w // 4, h // 4, w // 2, h // 2),
    "top-left":        lambda w, h: (0, 0, w // 2, h // 2),
    "top-center":      lambda w, h: (w // 4, 0, w // 2, h // 3),
    "top-right":       lambda w, h: (w // 2, 0, w // 2, h // 2),
    "bottom-left":     lambda w, h: (0, h // 2, w // 2, h // 2),
    "bottom-center":   lambda w, h: (w // 4, h * 2 // 3, w // 2, h // 3 + 1),
    "bottom-right":    lambda w, h: (w // 2, h // 2, w // 2, h // 2),
}


def parse_region(text, w_full, h_full):
    if not text:
        return None
    key = text.strip().lower()
    if key in NAMED_REGIONS:
        return NAMED_REGIONS[key](w_full, h_full)

    m = re.match(
        r"^(?:(top|bottom|left|right|center)(\d*))?(?:-(?:(left|center|right)(\d*))?)?$",
        key.replace("_", "-"))
    if m and (m.group(1) or m.group(3)):
        dir1, pct1_str = m.group(1), m.group(2)
        dir2, pct2_str = m.group(3), m.group(4)

        def _default(d):
            return 50 if d == "center" else 25

        pct1 = int(pct1_str) if pct1_str else (_default(dir1) if dir1 else 0)
        pct2 = int(pct2_str) if pct2_str else (_default(dir2) if dir2 else 0)

        if dir1 == "top":
            y, h = 0, h_full * pct1 // 100
        elif dir1 == "bottom":
            y, h = h_full * (100 - pct1) // 100, h_full * pct1 // 100
        elif dir1 == "center":
            ch = h_full * pct1 // 200
            y, h = h_full // 2 - ch, ch * 2
        else:
            y, h = 0, h_full

        h_dir = dir2 or (dir1 if dir1 in ("left", "right", "center") else None)
        h_pct = pct2 if dir2 else (pct1 if dir1 in ("left", "right", "center") else 0)

        if h_dir == "left":
            x, w = 0, w_full * h_pct // 100
        elif h_dir == "right":
            x, w = w_full * (100 - h_pct) // 100, w_full * h_pct // 100
        elif h_dir == "center":
            hw = w_full * h_pct // 200
            x, w = w_full // 2 - hw, hw * 2
        else:
            x, w = 0, w_full

        return (max(0, x), max(0, y), min(w, w_full - x), min(h, h_full - y))

    parts = [int(v.strip()) for v in text.split(",")]
    if len(parts) != 4:
        return None
    rx, ry, rw, rh = parts
    rx = max(0, min(rx, w_full - 1))
    ry = max(0, min(ry, h_full - 1))
    rw = min(rw, w_full - rx)
    rh = min(rh, h_full - ry)
    return (rx, ry, rw, rh)


def text_match_score(query, ocr_text):
    """返回 0-1 匹配分数。>= 0.6 视为匹配。"""
    q = query.lower().strip()
    t = ocr_text.lower().strip()
    if not q or not t:
        return 0
    if q in t:
        return 1.0
    # t in q 仅当 t 足够长（>= q 的 60%）且 ≥ 2 字符时才算部分匹配
    if t in q and len(t) >= max(2, len(q) * 0.6):
        return 0.8
    # 逐字符匹配比例 + 最长公共子序列
    q_chars = set(q)
    t_chars = set(t)
    if q_chars:
        char_overlap = len(q_chars & t_chars) / len(q_chars)
    else:
        char_overlap = 0
    # 最长公共子串比例
    from difflib import SequenceMatcher
    matcher = SequenceMatcher(None, q, t)
    seq_ratio = matcher.ratio()
    # 要求最长公共子序列至少覆盖 query 的一半字符
    match_len = matcher.find_longest_match(0, len(q), 0, len(t)).size
    if match_len / len(q) < 0.5:
        return 0
    combined = char_overlap * 0.7 + seq_ratio * 0.3
    return max(combined, seq_ratio)


def find_text_easyocr(img, text, region, w_full, h_full):
    """用 EasyOCR 在图像（或区域）中搜索文字。

    返回: [(x, y, w, h, confidence, match_score, position_score), ...] 按综合分降序
    """
    reader = get_reader()

    if region:
        rx, ry, rw, rh = region
        crop = img[ry:ry + rh, rx:rx + rw]
        search_img = np.ascontiguousarray(crop)
    else:
        rx, ry = 0, 0
        search_img = img

    h_img, w_img = search_img.shape[:2]

    # EasyOCR 在小图上效果差，放大到至少 500px 最小边
    scale = 1
    min_dim = min(h_img, w_img)
    if min_dim < 500:
        scale = 500 // min_dim + 1
        search_img = cv2.resize(search_img,
                                (w_img * scale, h_img * scale),
                                interpolation=cv2.INTER_CUBIC)

    # 多轮尝试：原图 + CLAHE 增强 + 反色
    results = []
    seen_texts = set()

    def ocr_pass(img_input, label):
        nonlocal results
        result = reader.readtext(img_input, detail=1)
        for bbox, txt, conf in result:
            if txt.lower() in seen_texts:
                continue
            seen_texts.add(txt.lower())
            x1, y1 = int(bbox[0][0]), int(bbox[0][1])
            x2, y2 = int(bbox[2][0]), int(bbox[2][1])
            bw, bh = x2 - x1, y2 - y1
            if bw <= 0 or bh <= 0:
                continue
            # 缩回原图坐标
            sx, sy = x1 // scale, y1 // scale
            sbw, sbh = bw // scale, bh // scale
            match_score = text_match_score(text, txt)
            if match_score >= 0.6:
                results.append((sx + rx, sy + ry, sbw, sbh, conf, match_score, txt, label))

    # Pass 1: 原图
    ocr_pass(search_img, "original")

    # Pass 2: CLAHE 增强
    gray = cv2.cvtColor(search_img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray_enh = clahe.apply(gray)
    enhanced = cv2.cvtColor(gray_enh, cv2.COLOR_GRAY2BGR)
    ocr_pass(enhanced, "clahe")

    # Pass 3: 反色（深色背景白字）
    gray_inv = cv2.bitwise_not(gray)
    inverted = cv2.cvtColor(gray_inv, cv2.COLOR_GRAY2BGR)
    ocr_pass(inverted, "inverted")

    # 按综合分排序: match_score 为主, conf 为辅
    # title bar 惩罚: y < 30 的结果降权（避免把窗口标题误认为工具栏按钮）
    def sort_key(r):
        x, y, w, bh, conf, match_score, txt, src = r
        title_penalty = 0.3 if y < 30 else 0.0
        return match_score * 0.7 + conf * 0.3 - title_penalty
    results.sort(key=sort_key, reverse=True)
    return results


def draw_mark(img, x, y, w, h, label):
    cx, cy = x + w // 2, y + h // 2
    color = (0, 0, 255)
    radius = max(w, h) // 2 + 16
    cv2.ellipse(img, (cx, cy), (radius, int(radius * 0.75)), 0, 0, 360, color, 3)
    if label:
        label_s = str(label)
        (tw2, _), _ = cv2.getTextSize(label_s, cv2.FONT_HERSHEY_SIMPLEX, 1.5, 3)
        lx, ly = cx + radius + 8, cy - 10
        cv2.rectangle(img, (lx - 4, ly - 4), (lx + tw2 + 4, ly + 30 + 4), (255, 255, 255), -1)
        cv2.putText(img, label_s, (lx, ly + 24), cv2.FONT_HERSHEY_SIMPLEX, 1.5, color, 3)


def main():
    parser = argparse.ArgumentParser(
        description="Mark text on screenshot with EasyOCR + red ellipse")
    parser.add_argument("screenshot", help="Input screenshot PNG file")
    parser.add_argument("args", nargs="*",
                        help='"text:region" pairs')
    parser.add_argument("--region", default=None,
                        help='Region shortcut for all texts without explicit region')
    a = parser.parse_args()

    if not a.args:
        print("Error: need at least one text:region pair", file=sys.stderr)
        sys.exit(1)

    has_colon = any(":" in arg for arg in a.args)
    if has_colon:
        batch = [(arg.rsplit(":", 1)[0], arg.rsplit(":", 1)[1] if ":" in arg else None)
                 for arg in a.args]
    else:
        batch = [(arg, a.region) for arg in a.args]

    img = cv2.imread(a.screenshot)
    if img is None:
        print(f"Error: cannot read {a.screenshot}", file=sys.stderr)
        sys.exit(1)

    h_full, w_full = img.shape[:2]
    base = os.path.splitext(a.screenshot)[0]
    all_results = []
    found_count = 0
    missing_count = 0
    frames = []  # 增量帧序列

    for idx, (txt, reg_name) in enumerate(batch):
        region = parse_region(reg_name, w_full, h_full) if reg_name else None

        circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"]
        label = circled[idx] if idx < len(circled) else str(idx + 1)
        if len(batch) == 1:
            label = ""

        if region:
            print(f"  [{txt}] region {reg_name}: ({region[0]},{region[1]})-{region[2]}x{region[3]}",
                  file=sys.stderr)

        candidates = find_text_easyocr(img, txt, region, w_full, h_full)

        if not candidates:
            print(f"  Warning: text '{txt}' not found in region", file=sys.stderr)
            missing_count += 1
            frames.append(img.copy())
            continue

        found_count += 1
        x, y, w, bh, conf, match_score, ocr_txt, src = candidates[0]
        all_results.append({"text": txt, "x": x, "y": y, "w": w, "h": bh,
                            "confidence": round(conf, 2),
                            "match_score": round(match_score, 3),
                            "ocr_text": ocr_txt, "source": src})
        print(f"  #{found_count} '{txt}' → OCR '{ocr_txt}' at ({x},{y})-({x + w},{y + bh}) "
              f"conf={conf:.2f} match={match_score:.2f} src={src}",
              file=sys.stderr)

        draw_mark(img, x, y, w, bh, "" if len(batch) == 1 else found_count)
        frames.append(img.copy())

    if missing_count:
        print(f"Done: {found_count} found, {missing_count} skipped (not found)",
              file=sys.stderr)
    else:
        print(f"Done: all {found_count} found!", file=sys.stderr)

    if len(frames) >= 1:
        for fi, frame in enumerate(frames):
            frame_path = f"{base}_marked_{fi + 1}.png"
            cv2.imwrite(frame_path, frame)
        print(f"Saved {len(frames)} frame(s): {base}_marked_1..{len(frames)}.png")


if __name__ == "__main__":
    main()
