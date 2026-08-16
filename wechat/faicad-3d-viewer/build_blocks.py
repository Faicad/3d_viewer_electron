#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把公众号文章 Markdown 转换为发布区块 JSON。
- 文本块 -> 带内联样式的 HTML
- 图片块 -> 本地绝对路径（供 Playwright 上传）
输出: article.blocks.json
"""
import json, re, os, sys

SRC = os.path.join(os.path.dirname(__file__), "article.md")
OUT = os.path.join(os.path.dirname(__file__), "article.blocks.json")

# ---------- 内联格式 ----------
def inline(text):
    # 行内代码 `x`
    text = re.sub(r"`([^`]+)`", r"<code style='background:#f5f5f5;padding:1px 4px;border-radius:3px;font-family:monospace;'>\1</code>", text)
    # 加粗 **x**
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return text

# ---------- frontmatter ----------
raw = open(SRC, encoding="utf-8").read()
m = re.match(r"^---\n(.*?)\n---\n", raw, re.S)
fm = {}
if m:
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip().strip('"').strip("'")
    body = raw[m.end():]
else:
    body = raw

base = os.path.dirname(SRC)
cover_rel = fm.get("cover", "./images/cover.png").lstrip("./")
cover_abs = os.path.normpath(os.path.join(base, cover_rel))
meta = {
    "title": fm.get("title", ""),
    "author": fm.get("description") and "" or fm.get("author", ""),
    "author_name": fm.get("author", "Faicad"),
    "digest": fm.get("description", ""),
    "cover": cover_abs,
}

# ---------- 区块解析 ----------
lines = body.split("\n")
blocks = []
i = 0
n = len(lines)

def is_sep(s):
    return bool(re.match(r"^\s*\|?[\s:\-|]+\|?\s*$", s)) and "-" in s

while i < n:
    line = lines[i]
    if line.strip() == "":
        i += 1
        continue
    # 图片
    if line.lstrip().startswith("![") and "](" in line:
        mm = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if mm:
            alt, path = mm.group(1), mm.group(2)
            p = path.lstrip("./")
            abs_p = os.path.normpath(os.path.join(base, p))
            blocks.append({"type": "image", "src": abs_p, "alt": alt})
        i += 1
        continue
    # 标题
    hm = re.match(r"^(#{1,6})\s+(.*)$", line)
    if hm:
        level = len(hm.group(1))
        txt = inline(hm.group(2).strip())
        style = {
            1: "font-size:22px;font-weight:bold;margin:24px 0 12px;line-height:1.4;",
            2: "font-size:19px;font-weight:bold;margin:22px 0 10px;line-height:1.4;",
            3: "font-size:17px;font-weight:bold;margin:18px 0 8px;",
        }.get(level, "font-weight:bold;margin:16px 0 8px;")
        blocks.append({"type": "html", "html": f"<h{level} style='{style}'>{txt}</h{level}>"})
        i += 1
        continue
    # 表格
    if line.lstrip().startswith("|") and i + 1 < n and is_sep(lines[i + 1]):
        # 表头
        def cells(s):
            s = s.strip().strip("|")
            return [c.strip() for c in s.split("|")]
        header = cells(line)
        i += 2  # 跳过分隔行
        rows = []
        while i < n and lines[i].lstrip().startswith("|") and lines[i].strip() != "":
            rows.append(cells(lines[i]))
            i += 1
        th = "".join(f"<th style='border:1px solid #e0e0e0;padding:7px 9px;background:#f6f7f9;font-weight:bold;text-align:left;'>{inline(c)}</th>" for c in header)
        trs = ""
        for r in rows:
            tds = "".join(f"<td style='border:1px solid #e0e0e0;padding:7px 9px;text-align:left;'>{inline(c)}</td>" for c in r)
            trs += f"<tr>{tds}</tr>"
        tbl = (f"<table style='border-collapse:collapse;width:100%;margin:14px 0;"
               f"font-size:14px;line-height:1.6;color:#333;'>{th}{trs}</table>")
        blocks.append({"type": "html", "html": tbl})
        continue
    # 列表
    if line.lstrip().startswith("- "):
        items = []
        while i < n and lines[i].lstrip().startswith("- "):
            items.append("<li style='margin:4px 0;'>" + inline(lines[i].lstrip()[2:].strip()) + "</li>")
            i += 1
        blocks.append({"type": "html", "html": f"<ul style='padding-left:22px;margin:12px 0;line-height:1.8;'>{''.join(items)}</ul>"})
        continue
    # 段落（聚合连续非空行）
    para = []
    while i < n and lines[i].strip() != "" and not lines[i].lstrip().startswith(("#", "- ", "!", "|")):
        para.append(lines[i].strip())
        i += 1
    if para:
        txt = "<br>".join(inline(p) for p in para)
        blocks.append({"type": "html", "html": f"<p style='margin:12px 0;line-height:1.8;font-size:15px;color:#333;'>{txt}</p>"})
    else:
        i += 1

out = {"meta": meta, "blocks": blocks}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

# 统计
imgs = [b for b in blocks if b["type"] == "image"]
print(f"title : {meta['title']}")
print(f"author: {meta['author_name']}")
print(f"cover : {meta['cover']}  exists={os.path.exists(meta['cover'])}")
print(f"blocks: {len(blocks)}  (html={len(blocks)-len(imgs)}, image={len(imgs)})")
for b in imgs:
    print("  IMG", b["src"], "exists=", os.path.exists(b["src"]))
