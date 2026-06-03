# 3MF 组件结构分析：vise 测试夹具

## 概述

`3D/3dmodel.model` 中定义了 19 个 `<build><item>`、19 个 `<resources><object>`、21 个 `<component>`。  
Flat 展开后 ThreeMFLoader 产出 **21 个 Mesh**。

---

## 数量关系

```
19  build items  →  19  resources objects  →  21  components  →  21  flattened meshes
```

其中 17 个 object 各含 **1** 个 component，2 个 object 各含 **2** 个 component：

| Object ID | 零件名 | Plate | Component 数 | 引用文件 | 说明 |
|-----------|--------|-------|-------------|---------|------|
| 2 | screw holder | 1 | 1 | `object_6.model` | 单零件 |
| 4 | screw_cup | 1 | 1 | `object_7.model` | 单零件 |
| 6 | screw (2) | 1 | 1 | `object_12.model` | 单零件 |
| 8 | jaw_11 | 1 | 1 | `object_14.model` | 单零件 |
| 10 | jaw_12 | 1 | 1 | `object_15.model` | 单零件 |
| 12 | jaw_12 (1) | 1 | 1 | `object_18.model` | 单零件 |
| 14 | jaw_12 (1) (1) | 1 | 1 | `object_19.model` | 单零件 |
| 16 | runner | 2 | 1 | `object_26.model` | 单零件 |
| **19** | **vise body** | **2** | **2** | `object_37.model` × 2 | 主体+蓝色镶嵌，Z 偏移 -19mm |
| **22** | **holder** | **2** | **2** | `object_44.model` × 2 | 镜像副本，Z 偏移 +9.996mm |
| 24 | screw1 (1) | 2 | 1 | `object_47.model` | 4 个 build item 共用此网格 |
| 25 | screw1 (1) | 2 | 1 | `object_47.model` | ↑ |
| 26 | screw1 (1) | 2 | 1 | `object_47.model` | ↑ |
| 27 | screw1 (1) | 2 | 1 | `object_47.model` | ↑ |
| 29 | rail left | 1 | 1 | `object_51.model` | 2 个 build item 共用此网格 |
| 30 | rail left | 1 | 1 | `object_51.model` | ↑ |
| 32 | jaw_21 (1) | 1 | 1 | `object_57.model` | 2 个 build item 共用此网格 |
| 33 | jaw_21 (1) | 1 | 1 | `object_57.model` | ↑ |
| 35 | safty | 1 | 1 | `object_61.model` | 单零件 |

---

## 多组件对象详解

### object id="19" — 2 个 component

```xml
<object id="19" p:UUID="00000025-...">
  <components>
    <component p:path="/3D/Objects/object_37.model" objectid="17"
               transform="1 0 0 0 1 0 0 0 1  0 0 0"/>
    <component p:path="/3D/Objects/object_37.model" objectid="18"
               transform="1 0 0 0 1 0 0 0 1  -0.232 -1.691 -19"/>
  </components>
</object>
```

- 两个 component 引用**同一个文件** `object_37.model`
- 第二个在第一个基础上平移 `(-0.23, -1.69, -19) mm`
- 这在 Bambu Studio 中表现为**对称/镜像零件**的两个实例

### object id="22" — 2 个 component

```xml
<object id="22" p:UUID="0000002c-...">
  <components>
    <component p:path="/3D/Objects/object_44.model" objectid="20"
               transform="1 0 0 0 1 0 0 0 1  0 0 0"/>
    <component p:path="/3D/Objects/object_44.model" objectid="21"
               transform="1 0 0 0 1 0 0 0 1  0.133 17.651 9.996"/>
  </components>
</object>
```

- 同样是**一个文件、两个位置**
- 第二个平移 `(0.13, 17.65, 10) mm`

---

## 多 Build Item 共享同一网格文件

多个 `<build><item>` 可以引用同一个 `<object>`，而该 `<object>` 再通过 `<components>` 引用同一个 `.model` 文件。这意味着同一份网格数据在打印平台上出现多次。

| 网格文件 | 被 build item 引用次数 | object ID |
|---------|----------------------|-----------|
| `object_47.model` | 4 | 24, 25, 26, 27 |
| `object_51.model` | 2 | 29, 30 |
| `object_57.model` | 2 | 32, 33 |

这 8 个 build item 各自有独立的 transform（位置/朝向），但共享同一个网格来源。

---

## 对 ThreeMFLoader 的影响

ThreeMFLoader 的展开逻辑：

```
build item → object → components → 每个 component 产出 1 个 Mesh
```

因此：

```
build items:  19
objects:      19
components:   17×1 + 2×2 = 21
flat meshes:  21
```

这就是 Bambu 解析器必须输出 21 个 `BambuPartMeta` 的原因 — 与 ThreeMFLoader 的 mesh 索引一一对应。
