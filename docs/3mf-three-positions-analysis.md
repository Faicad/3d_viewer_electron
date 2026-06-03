# 3MF 三种位置信息对比分析

以 `vise.3mf` 为例，同一个零件（`object id="2"` / `screw holder`）在三个地方记录了位置信息。

---

## 一、`<build>` — 打印平台位置

**文件**：`3D/3dmodel.model`

```xml
<build>
  <item objectid="2"
        transform="1 0 0 0 1 0 0 0 1  92.364 36.436 45.5" />
</build>
```

**含义**：零件在 Bambu Studio 切片软件 3D 视口中的摆放位置，经过自动排版（可能有旋转、镜像、靠边对齐）。

**坐标系**：打印平台坐标，Z 轴朝上，原点在平台中心或角落。

---

## 二、`<assemble>` — 装配位置

**文件**：`Metadata/model_settings.config`

```xml
<assemble>
  <assemble_item object_id="2" instance_id="0"
                 transform="1 0 0 0 1 0 0 0 1  0 0 45.5"
                 offset="0 0 0" />
</assemble>
```

**含义**：零件在**最终组装体**中的理想相对位置。Z 偏移量反映了零件在装配体中的堆叠高度。

**`offset` 字段**：在 `transform` 基础上额外叠加的平移微调量，用于用户在装配面板中手动微调零件位置（类似 "nudge"），而不修改旋转矩阵。最终位置 = `transform × offset`。在本 fixture 中，所有 offset 均为 `"0 0 0"`，说明位置完全由 `transform` 精确描述，无需手动微调。

**坐标系**：以第一个零件（通常是主体）为原点，Z 轴向上表示堆叠方向。

---

## 三、`<part><metadata key="matrix">` — 原始 CAD 位置

**文件**：`Metadata/model_settings.config`

```xml
<part id="1">
  <metadata key="matrix" value="1 0 0 0  0 1 0 0  0 0 1 0  0 0 0 1"/>
  <metadata key="source_offset_x" value="0"/>
  <metadata key="source_offset_y" value="-93.849"/>
  <metadata key="source_offset_z" value="-98.5"/>
</part>
```

**含义**：零件从原始 STL/STEP 导入时的位置。`matrix` 是 4×4 矩阵，非身份矩阵表示在导入时已做旋转/平移。

**坐标系**：原始 CAD 空间（STL 文件的局部坐标系）。

**`source_offset_x/y/z`**：独立于 `matrix` 的额外平移，在 Bambu Studio 导入 STL 后做"放平"自动定位时生成。最终原始位置 = `matrix` × `source_offset`。大多数零件直接用 `matrix` 表示位置（含平移），仅部分从主体切割出的零件使用 identity matrix + source_offset 的组合。

---

## 四、矩阵格式详解

### 4.1 矩阵存储顺序

两种格式均采用 **行主序 (row-major)**：

| 格式 | 值数量 | 实际 4×4 矩阵 |
|---|---|---|
| `build`/`assemble` `transform` | 12 | `M11 M12 M13 TX` / `M21 M22 M23 TY` / `M31 M32 M33 TZ` / `0 0 0 1` |
| `part` `<metadata key="matrix">` | 16 | 完整的 16 值 4×4 矩阵，最后一行恒为 `0 0 0 1` |

```text
build/assemble 的 12 个值映射为 4×4 矩阵：

    M11  M12  M13  TX      例如 (identity + tx=92.36):
    M21  M22  M23  TY         1  0  0  92.364
    M31  M32  M33  TZ         0  1  0  36.436
     0    0    0    1         0  0  1  45.5
                             0  0  0   1
```

对点 `v = (x, y, z)` 应用变换：`v' = M · [x, y, z, 1]^T`

即：
```
x' = M11·x + M12·y + M13·z + TX
y' = M21·x + M22·y + M23·z + TY
z' = M31·x + M32·y + M33·z + TZ
```

### 4.2 平移 (Translation)

`TX`, `TY`, `TZ` 是矩阵最后一列的平移分量，直接加在旋转/缩放结果之后。

- `<build>`：零件在打印平台上的摆放位置，包含 XY 排版偏移 + Z 抬升
- `<assemble>`：零件在装配体中的堆叠位置，XY 通常为 0（居中对齐），Z 为堆叠高度
- `<part>`：原始 STL 导入时的位置，由 `matrix` + `source_offset` 共同决定

### 4.3 旋转 (Rotation)

3×3 子矩阵（`M11`～`M33`）构成旋转矩阵。在本 fixture 中观察到四种旋转类型：

| 类型 | 3×3 矩阵 | 数学含义 | 出现零件 (assemble) |
|---|---|---|---|
| **无旋转 (0°)** | `1 0 0 / 0 1 0 / 0 0 1` | 单位矩阵，不做任何旋转 | 大多数零件 |
| **X 轴 -90°** | `1 0 0 / 0 0 -1 / 0 1 0` | Y→Z, Z→-Y | `object 22` |
| **X 轴 +90°** | `1 0 0 / 0 0 1 / 0 -1 0` | Y→-Z, Z→Y | `object 30` |
| **X 轴 180°** | `1 0 0 / 0 -1 0 / 0 0 -1` | Y→-Y, Z→-Z (翻转) | `object 25,26,27,35` |

四种旋转均绕 **X 轴**，说明 Bambu Studio 中零件的"放倒"和"翻转"都是以 X 轴为基准。

对应的欧拉角（绕 X 轴旋转 θ 度，右手法则）：

```text
X轴 -90°:  Rx(-90°) = [1 0 0; 0 0 1; 0 -1 0]    (零件从直立放平)
X轴 +90°:  Rx(+90°) = [1 0 0; 0 0 -1; 0 1 0]    (零件向另一侧放平)
X轴 180°:  Rx(180°) = [1 0 0; 0 -1 0; 0 0 -1]    (零件翻转180°)
```

### 4.4 缩放 (Scaling)

本 fixture 中所有矩阵行列式为 ±1（正交矩阵），**不存在缩放**。但在通用场景下，3MF 矩阵支持非均匀缩放和错切：

```text
非均匀缩放: [2 0 0; 0 1 0; 0 0 1]    — X 方向放大 2 倍
错切:       [1 0.5 0; 0 1 0; 0 0 1]  — XY 平面错切
```

### 4.5 镜像 (Reflection)

行列式为 **-1** 时表示包含镜像。本 fixture 中所有矩阵行列式为 +1（纯旋转）。

### 4.6 典型实例拆解

**object 22 (holder, assemble)**：
```xml
<assemble_item object_id="22" instance_id="0"
  transform="1 0 0  0 -2.22e-16 -1  0 1 -2.22e-16  259.79 -153.66 37.15" />
```

去掉近似零值后的实际变换：
```text
  x' =     x        + 259.79
  y' =     -z       - 153.66
  z' =     y        + 37.15
```

几何含义：零件围绕 X 轴逆时针旋转 90°（从直立变成平躺），然后平移到 (259.8, -153.7, 37.2)。

---

## 五、对比表 (综合)

以 `object id="2"` (screw holder) 为例：

| | `<build>` (打印平台) | `<assemble>` (装配) | `<part><matrix>` (原始 CAD) |
|---|---|---|---|
| **文件** | `3D/3dmodel.model` | `model_settings.config` | `model_settings.config` |
| **格式** | 4×3 矩阵 (12 值) | 4×3 矩阵 + offset (12+3 值) | 4×4 矩阵 (16 值) + source_offset |
| **平移 (TX,TY,TZ)** | (92.36, 36.44, 45.5) | (0, 0, 45.5) | matrix: (0,0,0) + offset: (-93.85, -98.5, 0) |
| **旋转类型** | 全部 identity | identity / Rx(-90°) / Rx(+90°) / Rx(180°) | 全部 identity |
| **缩放** | 无 (正交) | 无 (正交) | 无 (正交) |
| **用途** | 打印排版 | 装配体相对位置 | 导入原始位置 |
| **谁生成** | Bambu Studio 自动排版 | 用户装配操作 | STL 导入时的定位 |
| **是否可改** | 用户拖拽零件时会变 | 用户调整装配关系时变 | 导入后固定 |

以 `object id="22"` (holder, 多组件零件) 为例，它的 `<part id="21">` 有非身份矩阵：

```xml
<part id="21">
  <metadata key="matrix" value="1 0 0 0.797  0 1 0 105.906  0 0 1 59.974  0 0 0 1"/>
</part>
```

这个零件从原始 STL 导入时已经偏移了 (0.8, 105.9, 60.0)，说明它原本是装配体中的另一个独立零件，而非从主体中切分出来的。

---

## 六、数据流向图

```
原始 STL 文件
    │
    ▼
Bambu Studio 导入
    │
    ├──── <part><matrix>         ← 记录 STL 原本位置（不变）
    │
    ▼
用户构建装配体
    │
    ├──── <assemble>             ← 用户调整装配关系（堆叠顺序）
    │
    ▼
自动排版 / 手动拖拽
    │
    ├──── <build><item>           ← 排版后打印平台位置
    │
    ▼
保存为 .3mf
```

**关键结论**：三种位置互不覆盖，各自服务于不同的生命周期阶段——从原始导入到装配设计再到打印排版。
