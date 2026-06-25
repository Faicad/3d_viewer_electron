# OCR 顺序回退策略

> **推荐先试 EasyOCR**：中英文混合、小字体工具栏按钮等场景，Tesseract 可能失败。
> 用 `python movies/mark-text-easyocr.py` 替代 `mark-text.py`。详见 [`easyocr-vs-tesseract.md`](easyocr-vs-tesseract.md)。

`movies/mark-text.py` 的 `find_text()` 使用 5 层顺序回退策略。

## 策略层

| 层 | 方法 | 覆盖 |
|----|------|------|
| 1 | PSM 3 原图 | ~90% 常规文字 |
| 2 | 灰度反色 + PSM 11 | 反色/高亮文字 |
| 3 | PSM 6 原图 | 工具栏等稀疏布局 |
| 4 | 间隙中心 270px 窗口 + CLAHE 1x → 4x + OEM1 PSM7 | Tesseract 在全宽图上漏掉的特种渲染文字 |
| 5 | 低置信度(conf≥5) 反色 OEM1 PSM11 | 最后手段 |

EasyOCR 已集成（`mark-text-easyocr.py`），在以下场景优于 Tesseract：
- 中英文混合文字（如 "3d模型查看"）
- 小字体工具栏按钮（如 "技能" 在水平布局中被 Tesseract 误读为 "测试"）
- 需要稳定识别率（Tesseract 非确定性导致间歇性失败）

详见 [`easyocr-vs-tesseract.md`](easyocr-vs-tesseract.md)。

## 策略 4 的核心发现

### CLAHE 须在放大前做

在 1x 原图上做 CLAHE 增强，**再**放大 4x，比先放大 4x 再 CLAHE 效果好得多。原因：CLAHE 的 8x8 tile 在 1x 对应实际像素级纹理，在 4x 对应的是插值后的像素。

### PSM 7 对图像宽度极度敏感

Tesseract `--psm 7`（单行文本模式）对输入图像宽度有严格阈值，偏差 15px 就可能导致完全找不到文字：

| 原图宽度 | 结果 |
|---------|------|
| 255px | 0 个 token |
| 270px | 找到 "技" conf=90, "能" conf=93 |
| 280px | 0 个 token |

因此策略 4 不做全图扫描，而是用已知宽 token（w≥30, conf≥20, y>40）之间的间隙中心来定位 270px 窗口。

### 全宽图 vs 子区域的 OCR 差异

同一段文字在全宽图（816px）上用 OEM1 PSM7 返回 0 结果，但裁剪到 270px 子窗口后能读到 conf=90。原因是 PSM 7 的单行检测在宽图上被周围文字干扰。

## 灰度反色 vs BGR 反色

`cv2.bitwise_not()` 对 BGR 三通道彩色图会生成非自然颜色，Tesseract 几乎读不到中文（测试中整个 top 区域只返回 "D" 一个 token）。正确做法：

```python
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
gray_inv = cv2.bitwise_not(gray)
inv_img = cv2.cvtColor(gray_inv, cv2.COLOR_GRAY2BGR)
```

## Tesseract 非确定性

连续调用 `image_to_data` 对同一图像可能返回不同结果（同一区域：42 vs 46 个 token，或间歇性返回 0 个）。策略 4 包含 per-pass 空结果重试，并通过多 PSM/预处理组合覆盖各种情况。

## 字符间距

工具栏按钮间距可达 30-50px。`merge_nearby` 的 `x_gap` 需平衡：
- 合并不足："3d模型查看" 拆成 "3d模"+"型查看"
- 过度合并：整个工具栏合并为一个 token

当前 `x_gap=20`，配合 PSM 6 pass（自动合并并以完整字符串输出）覆盖两种场景。
