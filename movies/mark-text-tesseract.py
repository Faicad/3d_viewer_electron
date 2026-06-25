"""
在截图上找到指定文字并画红色椭圆标记 + 数字。

用法:
  python mark-text.py <截图.png> "文字1:区域" "文字2:区域" ...
  或: python mark-text.py <截图.png> 文字1 文字2 ... --region 区域

输出: {截图}_marks.json (坐标) + {截图}_marked.png (标注图)

区域支持:
  - 方位: top bottom left right center
    不带数字时默认 25% (center 50%), 可带数字: top20 bottom30 center40
  - 组合方位: top20-center30  bottom10-right25  top-center(等同于top25-center50)
  - 预定义: top-left top-center top-right
            bottom-left bottom-center bottom-right
  - 精确坐标: x,y,w,h

示例:
  python mark-text.py shot.png "专家:left" "技能:top20-center30" "3d模型查看:top" "SkillHub:top"
"""

import sys, os, re, json, argparse
from difflib import SequenceMatcher
import cv2
import numpy as np
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
os.environ["TESSDATA_PREFIX"] = os.environ.get("TESSDATA_PREFIX", os.environ["TEMP"])

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

    # 方位百分比: top20-center30, bottom10-right25, left40, center30, ...
    # 不带数字时默认: top/bottom/left/right=25%, center=50%
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

        # vertical
        if dir1 == "top":
            y, h = 0, h_full * pct1 // 100
        elif dir1 == "bottom":
            y, h = h_full * (100 - pct1) // 100, h_full * pct1 // 100
        elif dir1 == "center":
            ch = h_full * pct1 // 200
            y, h = h_full // 2 - ch, ch * 2
        else:
            y, h = 0, h_full

        # horizontal — dir2 takes precedence; if absent, dir1 may be horizontal
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

    # 精确坐标 x,y,w,h
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
    """返回 0-1 匹配分数。优先精确子串匹配, 否则用模糊匹配。"""
    q = query.lower().strip()
    t = ocr_text.lower().strip()
    if not q or not t:
        return 0
    # q in t: OCR text 包含 query → 可靠, 直接满分
    if q in t:
        return 1.0
    # t in q 跳过: OCR 短文本(如单个字"模")是 query 的子串 → 假阳性
    matcher = SequenceMatcher(None, q, t)
    ratio = matcher.ratio()
    if ratio > 0.6:
        # 要求最长公共子序列至少占 query 一半字符, 避免"专家"vs"专"(0.67)误匹配
        match_len = matcher.find_longest_match(0, len(q), 0, len(t)).size
        if match_len / len(q) <= 0.5:
            return 0
    return ratio


def position_score(region_name, x, y, w, h, rw, rh):
    """根据区域偏好给位置打分 (0~1)。越靠近预期位置分越高。"""
    if not region_name:
        return 0.5
    name = region_name.lower().strip()
    cx, cy = x + w / 2, y + h / 2
    if "," in name:
        return 0.5

    v = 0.5
    h_s = 0.5

    if "top" in name:
        v = 1 - cy / rh
    elif "bottom" in name:
        v = cy / rh
    if "left" in name:
        h_s = 1 - cx / rw
    elif "right" in name:
        h_s = cx / rw
    if "center" in name:
        h_s = 1 - abs(cx - rw / 2) / (rw / 2) if rw else 0.5

    return (v + h_s) / 2


def merge_nearby(blocks, y_gap=10, x_gap=20):
    """合并邻近的 OCR 文本块。blocks: [(x, y, w, h, text), ...]。"""
    if not blocks:
        return []
    blocks.sort(key=lambda b: (b[1], b[0]))

    # 分组到行 (根据 y 重叠)
    lines = []
    for b in blocks:
        x, y, w, h, text = b
        placed = False
        for line in lines:
            ly, lh = line["y"], line["h"]
            if y < ly + lh + y_gap and y + h > ly - y_gap:
                line["blocks"].append(b)
                ny = min(line["y"], y)
                nh = max(line["y"] + line["h"], y + h) - ny
                line["y"], line["h"] = ny, nh
                placed = True
                break
        if not placed:
            lines.append(dict(y=y, h=h, blocks=[b]))

    # 每行内合并水平邻近块
    merged = []
    for line in lines:
        row = sorted(line["blocks"], key=lambda b: b[0])
        cur = None
        for b in row:
            x, y, w, h, text = b
            if cur is None:
                cur = dict(x=x, y=y, w=w, h=h, text=text)
            elif x - (cur["x"] + cur["w"]) < x_gap:
                nx = min(cur["x"], x)
                ny = min(cur["y"], y)
                nw = max(cur["x"] + cur["w"], x + w) - nx
                nh = max(cur["y"] + cur["h"], y + h) - ny
                cur["x"], cur["y"] = nx, ny
                cur["w"], cur["h"] = nw, nh
                cur["text"] += text
            else:
                merged.append((cur["x"], cur["y"], cur["w"], cur["h"], cur["text"]))
                cur = dict(x=x, y=y, w=w, h=h, text=text)
        if cur:
            merged.append((cur["x"], cur["y"], cur["w"], cur["h"], cur["text"]))
    return merged


def _ocr_blocks(search_img, lang="chi_sim", config=None, conf_threshold=20):
    """对图像做 OCR，返回 [(x, y, w, h, text, conf), ...]（坐标相对于 search_img）。"""
    kwargs = dict(lang=lang, output_type=pytesseract.Output.DICT)
    if config:
        kwargs["config"] = config
    data = pytesseract.image_to_data(search_img, **kwargs)
    blocks = []
    for i in range(len(data["text"])):
        txt = data["text"][i].strip()
        if not txt:
            continue
        try:
            conf = int(data["conf"][i])
        except ValueError:
            continue
        if conf < conf_threshold:
            continue
        x, y = data["left"][i], data["top"][i]
        bw, bh = data["width"][i], data["height"][i]
        if bw <= 0 or bh <= 0:
            continue
        blocks.append((x, y, bw, bh, txt, conf))
    return blocks


def _build_candidates(raw_blocks, text, region, region_name, rw, rh):
    """从 raw_blocks 构建候选列表，返回 [(x, y, w, h, conf, score, pos, combined), ...]."""
    candidates = []

    def overlap_ratio(ax, ay, aw, ah, bx, by, bw, bh):
        ix = max(ax, bx)
        iy = max(ay, by)
        iw = max(0, min(ax + aw, bx + bw) - ix)
        ih = max(0, min(ay + ah, by + bh) - iy)
        if iw <= 0 or ih <= 0:
            return 0.0
        inter = iw * ih
        union = aw * ah + bw * bh - inter
        return inter / union if union > 0 else 0.0

    def add_candidate(x, y, w, h, conf, score, pos):
        for cx, cy, cw, ch, *_ in candidates:
            if overlap_ratio(x, y, w, h, cx, cy, cw, ch) > 0.5:
                return
        combined = score * (conf / 100) * 0.6 + pos * 0.4
        if region:
            candidates.append((x + region[0], y + region[1], w, h, conf, score, pos, combined))
        else:
            candidates.append((x, y, w, h, conf, score, pos, combined))

    # 单个块
    for x, y, bw, bh, txt, conf in raw_blocks:
        score = text_match_score(text, txt)
        if score > 0.6:
            pos = position_score(region_name, x, y, bw, bh, rw, rh)
            add_candidate(x, y, bw, bh, conf, score, pos)

    # 合并块
    merged = merge_nearby([(x, y, bw, bh, txt) for x, y, bw, bh, txt, _ in raw_blocks])
    for mx, my, mw, mh, mtext in merged:
        score = text_match_score(text, mtext)
        if score <= 0.6:
            continue
        max_conf = 0
        for x, y, bw, bh, txt, conf in raw_blocks:
            if x >= mx and y >= my and x + bw <= mx + mw and y + bh <= my + mh:
                max_conf = max(max_conf, conf)
        pos = position_score(region_name, mx, my, mw, mh, rw, rh)
        add_candidate(mx, my, mw, mh, max_conf, score, pos)

    candidates.sort(key=lambda c: c[7], reverse=True)
    return candidates


def find_text(search_img, text, region, region_name, w_full, h_full):
    """返回所有候选 [(x, y, w, h, conf, score, pos), ...]，按综合分降序。

    顺序回退策略:
      1. PSM 3 自动 — 覆盖主流布局
      2. 灰度反色 PSM 11 — 覆盖边缘/反色文字
      3. PSM 6 均匀块 — 覆盖工具栏等稀疏布局
    """
    h_img, w_img = search_img.shape[:2]
    # 保存 1x 灰度图（策略 4 间隙裁剪用，必须在放大前）
    gray_1x = cv2.cvtColor(search_img, cv2.COLOR_BGR2GRAY)
    # CLAHE 在放大前做（原始分辨率下增强效果更好）
    clahe_1x = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray_1x_enh = clahe_1x.apply(gray_1x)
    search_img = cv2.cvtColor(gray_1x_enh, cv2.COLOR_GRAY2BGR)

    scale = 1
    min_dim = min(h_img, w_img)
    if min_dim < 500:
        scale = 500 // min_dim + 1
        search_img = cv2.resize(search_img,
                                (w_img * scale, h_img * scale),
                                interpolation=cv2.INTER_CUBIC)

    rw = region[2] if region else w_img
    rh = region[3] if region else h_img

    gray = cv2.cvtColor(search_img, cv2.COLOR_BGR2GRAY)
    gray_inv = cv2.bitwise_not(gray)
    inv_img = cv2.cvtColor(gray_inv, cv2.COLOR_GRAY2BGR)

    # 策略 1: PSM 3 (自动)
    raw_blocks = _collect_blocks([(search_img, None)], scale)
    candidates = _build_candidates(raw_blocks, text, region, region_name, rw, rh)
    if candidates:
        return candidates

    # 策略 2: 灰度反色 PSM 11 (边缘/反色文字)
    more = _collect_blocks([(inv_img, "--psm 11")], scale)
    _merge_blocks(raw_blocks, more)
    candidates = _build_candidates(raw_blocks, text, region, region_name, rw, rh)
    if candidates:
        return candidates

    # 策略 3: PSM 6 (工具栏/稀疏布局)
    more = _collect_blocks([(search_img, "--psm 6")], scale)
    _merge_blocks(raw_blocks, more)
    candidates = _build_candidates(raw_blocks, text, region, region_name, rw, rh)
    if candidates:
        return candidates

    # 策略 4: token 间隙中心定位窗口 CLAHE+4x OEM1 PSM7
    # PSM 7 对窗口内文本布局敏感，基于已知宽 token 间隙定位
    WIN_W, WIN_H = 270, 70
    seen_win = set()
    # 收集宽 token 找间隙中心（只取 y>40 跳过顶部菜单栏）
    wide = sorted([(x, y, w, h, t, c) for x, y, w, h, t, c in raw_blocks
                    if h > 8 and w >= 30 and c >= 20 and y > 40], key=lambda b: (b[1], b[0]))
    if len(wide) >= 2:
        mid_y = int(sum(b[1] for b in wide) / len(wide))
        row = [b for b in wide if abs(b[1] - mid_y) < 30]
        row.sort(key=lambda b: b[0])
        centers = []
        for i in range(len(row) - 1):
            gap_center = (row[i][0] + row[i][2] + row[i + 1][0]) // 2
            centers.append(gap_center)
    else:
        # 无宽 token: 用均匀分布的中心点
        centers = list(range(WIN_W // 2, w_img, WIN_W // 2))
        mid_y = h_img // 2
    for cx in centers:
        for cy in [mid_y]:
            wx = max(0, cx - WIN_W // 2)
            wy = max(0, cy - WIN_H // 2)
            ww = min(WIN_W, w_img - wx)
            wh = min(WIN_H, h_img - wy)
            if ww < 100 or wh < 30:
                continue
            win_crop = gray_1x[wy:wy + wh, wx:wx + ww]
            win_enh = clahe_1x.apply(win_crop)
            win_4x = cv2.resize(win_enh, (ww * 4, wh * 4),
                                 interpolation=cv2.INTER_CUBIC)
            data = pytesseract.image_to_data(win_4x, lang="chi_sim",
                                              output_type=pytesseract.Output.DICT,
                                              config="--oem 1 --psm 7")
            for j in range(len(data["text"])):
                bt = data["text"][j].strip()
                if not bt:
                    continue
                try:
                    bc = int(data["conf"][j])
                except ValueError:
                    continue
                if bc < 20:
                    continue
                bx, by = data["left"][j], data["top"][j]
                bw, bh = data["width"][j], data["height"][j]
                if bw <= 0 or bh <= 0:
                    continue
                ox = wx + bx // 4
                oy = wy + by // 4
                ow, oh = bw // 4, bh // 4
                key = (ox, oy, ow, oh, bt.lower())
                if key in seen_win:
                    continue
                seen_win.add(key)
                raw_blocks.append((ox, oy, ow, oh, bt, bc))
    candidates = _build_candidates(raw_blocks, text, region, region_name, rw, rh)
    if candidates:
        return candidates

    # 策略 5: 低置信度反色 OEM1 (最后一次尝试)
    more_low = _collect_blocks([(inv_img, "--oem 1 --psm 11")], scale, conf_threshold=5)
    _merge_blocks(raw_blocks, more_low)
    candidates = _build_candidates(raw_blocks, text, region, region_name, rw, rh)
    return candidates

    # 策略 5: 低置信度反色 OEM1 (最后一次尝试)
    more_low = _collect_blocks([(inv_img, "--oem 1 --psm 11")], scale, conf_threshold=5)
    _merge_blocks(raw_blocks, more_low)
    candidates = _build_candidates(raw_blocks, text, region, region_name, rw, rh)
    return candidates


def _collect_blocks(passes, scale, conf_threshold=20):
    """执行多个 OCR pass，返回去重后的 [(x, y, w, h, text, conf), ...] (原图坐标)。"""
    blocks = []
    seen = set()
    for proc_img, psm_config in passes:
        ocr_blocks = _ocr_blocks(proc_img, config=psm_config, conf_threshold=conf_threshold)
        if not ocr_blocks:
            ocr_blocks = _ocr_blocks(proc_img, config=psm_config, conf_threshold=conf_threshold)
        for x, y, bw, bh, txt, conf in ocr_blocks:
            sx, sy = x // scale, y // scale
            sbw, sbh = bw // scale, bh // scale
            key = (sx, sy, sbw, sbh, txt.lower())
            if key not in seen:
                seen.add(key)
                blocks.append((sx, sy, sbw, sbh, txt, conf))
    return blocks


def _merge_blocks(existing, new):
    """将 new 中的块合并到 existing (去重)，原地修改 existing。"""
    existing_keys = {(x, y, w, h, t.lower()) for x, y, w, h, t, _ in existing}
    for x, y, w, h, t, c in new:
        key = (x, y, w, h, t.lower())
        if key not in existing_keys:
            existing_keys.add(key)
            existing.append((x, y, w, h, t, c))


def pick_candidate(candidates, text):
    """返回最佳候选 (x, y, w, h, conf, score, pos)。"""
    if not candidates:
        return None
    c = candidates[0]
    return c[:7]


# 搜索区域边框颜色 (BGR)，与红色椭圆区分
REGION_COLORS = [
    (0, 180, 0),     # green
    (180, 0, 180),   # purple
    (200, 160, 0),   # cyan-yellow
    (0, 140, 200),   # orange
    (100, 200, 0),   # lime
    (200, 0, 100),   # magenta
    (0, 180, 180),   # yellow
    (100, 100, 200), # salmon
]


def draw_region_boundary(img, x, y, w, h, label, color, found):
    """在图像上画搜索区域边框 + 标签。found=False 时额外标注 NOT FOUND。"""
    # 细线边框
    cv2.rectangle(img, (x, y), (x + w, y + h), color, 2)
    # 左上角标签: "① top20-center50" 或 "② top (not found)"
    text = f"{label} {'' if found else '(not found)'}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.55
    thick = 1
    (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
    # 标签放在区域左上角外侧，如果贴边就放在内侧
    lx, ly = x + 4, y - 6
    if ly - th < 0:
        ly = y + th + 8
    # 背景
    cv2.rectangle(img, (lx - 3, ly - th - 3), (lx + tw + 3, ly + 3), (255, 255, 255), -1)
    cv2.rectangle(img, (lx - 3, ly - th - 3), (lx + tw + 3, ly + 3), color, 1)
    cv2.putText(img, text, (lx, ly), font, scale, color, thick)


def draw_mark(img, x, y, w, h, label):
    cx, cy = x + w // 2, y + h // 2
    color = (0, 0, 255)
    radius = max(w, h) // 2 + 16
    cv2.ellipse(img, (cx, cy), (radius, int(radius * 0.75)), 0, 0, 360, color, 3)
    label_s = str(label)
    (tw2, _), _ = cv2.getTextSize(label_s, cv2.FONT_HERSHEY_SIMPLEX, 1.5, 3)
    lx, ly = cx + radius + 8, cy - 10
    cv2.rectangle(img, (lx - 4, ly - 4), (lx + tw2 + 4, ly + 30 + 4), (255, 255, 255), -1)
    cv2.putText(img, label_s, (lx, ly + 24), cv2.FONT_HERSHEY_SIMPLEX, 1.5, color, 3)


def main():
    parser = argparse.ArgumentParser(
        description="Mark text on screenshot with red ellipse + number")
    parser.add_argument("screenshot", help="Input screenshot PNG file")
    parser.add_argument("args", nargs="*",
                        help='"text:region" pairs. Shortcut: text --region x')
    parser.add_argument("--region", default=None,
                        help='Region shortcut: text --region left = "text:left"')
    args = parser.parse_args()

    if not args.args:
        print("Error: need at least one text:region pair", file=sys.stderr)
        sys.exit(1)

    # -- 统一转为 [(text, region_name), ...]
    has_colon = any(":" in a for a in args.args)
    if has_colon:
        batch = [(a.rsplit(":", 1)[0], a.rsplit(":", 1)[1] if ":" in a else None)
                 for a in args.args]
    else:
        # text [text2 ...] --region x → 全部复用同一 region
        batch = [(a, args.region) for a in args.args]

    img = cv2.imread(args.screenshot)
    if img is None:
        print(f"Error: cannot read {args.screenshot}", file=sys.stderr)
        sys.exit(1)

    h_full, w_full = img.shape[:2]
    base = os.path.splitext(args.screenshot)[0]
    marks_json_path = base + "_marks.json"
    all_results = []
    found_count = 0
    missing_count = 0
    # 动画帧：每处理完一个目标就保存一帧
    frames = []

    for idx, (txt, reg_name) in enumerate(batch):
        region = parse_region(reg_name, w_full, h_full) if reg_name else None
        if region:
            crop = img[region[1]:region[1] + region[3],
                       region[0]:region[0] + region[2]]
            search_img = np.ascontiguousarray(crop)
        else:
            search_img = img

        color = REGION_COLORS[idx % len(REGION_COLORS)]
        # 使用带圈数字 ①-⑧
        circled = ["①", "②", "③", "④",
                   "⑤", "⑥", "⑦", "⑧"]
        label = circled[idx] if idx < len(circled) else str(idx + 1)

        if region:
            print(f"  [{txt}] region {reg_name}: ({region[0]},{region[1]})-{region[2]}x{region[3]}",
                  file=sys.stderr)

        candidates = find_text(search_img, txt, region, reg_name, w_full, h_full)
        r = pick_candidate(candidates, txt)

        if r is None:
            print(f"  Warning: text '{txt}' not found in region, skipping", file=sys.stderr)
            missing_count += 1
            if region:
                draw_region_boundary(img, region[0], region[1], region[2], region[3],
                                     f"{label} {reg_name or 'full'}", color, found=False)
            # 未找到也保存一帧（显示区域边框 + 之前找到的标记）
            frames.append(img.copy())
            continue

        found_count += 1
        x, y, w, bh, conf, score, pos = r
        all_results.append({"text": txt, "x": x, "y": y, "w": w, "h": bh,
                            "confidence": conf, "match_score": round(score, 3),
                            "position_score": round(pos, 3)})
        print(f"  #{found_count} '{txt}' at ({x},{y})-({x + w},{y + bh}) conf={conf} match={score:.2f} pos={pos:.2f}",
              file=sys.stderr)

        if region:
            draw_region_boundary(img, region[0], region[1], region[2], region[3],
                                 f"{label} {reg_name}", color, found=True)
        draw_mark(img, x, y, w, bh, found_count)
        # 保存增量帧
        frames.append(img.copy())

    if missing_count:
        print(f"Done: {found_count} found, {missing_count} skipped (not found)",
              file=sys.stderr)

    with open(marks_json_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"Coordinates saved: {marks_json_path}", file=sys.stderr)

    # 输出：最后一帧 + 增量帧序列
    out_img = base + "_marked.png"
    cv2.imwrite(out_img, img)
    print(f"Saved: {out_img}")

    if len(frames) > 1:
        for fi, frame in enumerate(frames):
            frame_path = f"{base}_marked_{fi + 1}.png"
            cv2.imwrite(frame_path, frame)
        print(f"Saved {len(frames)} frame(s): {base}_marked_1..{len(frames)}.png")


if __name__ == "__main__":
    main()
