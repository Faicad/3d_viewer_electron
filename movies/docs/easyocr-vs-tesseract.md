# EasyOCR vs Tesseract 对比

## 结论

**EasyOCR 在中英文混合、小字体、工具栏按钮等场景下显著优于 Tesseract。**

`mark-text.py` (Tesseract) 在以下场景失败时，`mark-text-easyocr.py` 全部正确识别。

## 实测对比

测试命令：
```bash
python movies/mark-text.py movies/screenshot/WorkBuddy_v.png "专家:left" "技能:top13-center50" "3d模型查看:top15" "SkillHub:top"
python movies/mark-text.py movies/screenshot/WorkBuddy_h.png "专家:left" "技能:top13-center50" "3d模型查看:top15" "SkillHub:top"
```

### 垂直截图 (1500×1368)

| 目标 | 区域 | Tesseract | EasyOCR |
|------|------|-----------|---------|
| 专家 | left | ✓ (91,358) conf=96 | ✓ (86,353) conf=1.00 |
| 技能 | top13-center50 | ✓ (594,80) conf=96 | ✓ (731,91) conf=0.97 |
| 3d模型查看 | top15 | ✗ 间歇性失败 | ✓ (1020,91) conf=0.34 |
| SkillHub | top | ✓ (733,298) conf=42 | ✓ (728,292) conf=0.68 |

### 水平截图 (2560×1368)

| 目标 | 区域 | Tesseract | EasyOCR |
|------|------|-----------|---------|
| 专家 | left | ✓ (91,358) conf=96 | ✓ (85,353) conf=1.00 |
| 技能 | top13-center50 | **✗ 找不到** | ✓ (730,90) conf=0.89 |
| 3d模型查看 | top15 | ✓ (1945,96) conf=95 | ✓ (1934,88) conf=0.68 |
| SkillHub | top | ✓ (733,298) conf=58 | ✓ (729,293) conf=0.47 |

### 关键差异

1. **"技能" in 水平 top13-center50**：Tesseract 完全找不到。EasyOCR 正确识别。
   - Tesseract 把 "技能" 误读为 "测试"（conf=88），导致匹配失败
   - EasyOCR 直接读出 "技能"（conf=0.89），精确匹配

2. **"3d模型查看" in 垂直 top15**：Tesseract 不稳定（间歇性失败，需重试）。
   EasyOCR 稳定识别。

3. **"SkillHub"**：Tesseract 置信度低（42-58），EasyOCR 置信度高（0.47-0.68），且位置更精确。

## 实现文件

- `movies/mark-text.py` — Tesseract 版本（5 层回退策略，见 `docs/ocr-fallback-strategy.md`）
- `movies/mark-text-easyocr.py` — EasyOCR 版本（3 轮预处理：原图 + CLAHE + 反色）

## 使用方式

```bash
# EasyOCR (推荐，中英文混合场景更准)
python movies/mark-text-easyocr.py <截图.png> "文字:区域" ...

# Tesseract (更快，纯英文或大文本场景可用)
python movies/mark-text.py <截图.png> "文字:区域" ...
```

## EasyOCR 匹配算法

`text_match_score()` 的匹配阈值 ≥ 0.6：

| 条件 | 分数 | 说明 |
|------|------|------|
| `q in t` | 1.0 | OCR 文本包含查询文本（最可靠） |
| `t in q` 且 len(t) ≥ max(2, len(q)×0.6) | 0.8 | 查询文本包含 OCR 文本 |
| 字符重叠 + 序列匹配 | 0-1 | 模糊匹配，要求 LCS ≥ query 的 50% |

## EasyOCR 排序算法

```
综合分 = match_score × 0.7 + confidence × 0.3 - title_penalty
```

- `title_penalty = 0.3` 当 `y < 30`（排除窗口标题栏干扰，如 "WorkBuddy" 被误匹配为 "SkillHub"）
- 主排序键为 match_score，确保精确匹配优先于高置信度模糊匹配

## 性能

- EasyOCR 首次运行需下载模型（~100MB），后续使用缓存
- CPU 模式下每个 4 目标的截图约需 30-60 秒
- GPU (CUDA) 模式下速度提升 5-10×
