# 3MF 核心概念关系

```
    3MF Package (.zip)
   ┌───────────────────────────┐
   │  [Content_Types].xml       │  ← 声明包内文件类型
   │  _rels/.rels               │  ← 根关系：指向 3D/3dmodel.model
   │  3D/                       │
   │    ├── 3dmodel.model       │  ← 主清单
   │    ├── _rels/              │
   │    │   └── 3dmodel.model.rels  │  ← 列出所有 .model 文件
   │    └── Objects/            │
   │        ├── object_6.model  │  ← 实际的网格数据
   │        ├── object_7.model  │
   │        └── ...             │
   └───────────────────────────┘
```

## 概念从顶到底

```
  build  (打印任务：要打印哪些东西、放哪里)
    │
    ├── item ①               ← objectid="2", 放在平台 (92, 36, 45.5)
    │     │
    │     └── object id="2"  (逻辑零件：screw holder)
    │           │
    │           └── components
    │                 │
    │                 └── component ①  ← p:path="object_6.model", objectid="1"
    │                                        │
    │                                        └── .model 文件中的网格
    │                                              └── mesh → vertices + triangles
    │
    ├── item ②               ← objectid="19" (vise body)
    │     │
    │     └── object id="19"
    │           │
    │           └── components
    │                 ├── component ①  ← object_37.model, objectid="17" (白色主体)
    │                 └── component ②  ← object_37.model, objectid="18" (蓝色镶嵌)
    │
    └── item ③ ... (共 19 个)
```

## 各概念定义

| 概念 | 位置 | 含义 |
|------|------|------|
| **build** | `3dmodel.model` `<build>` | 整个打印任务，包含所有要打印的 item |
| **build item** | `<build><item objectid="...">` | 一个待打印的逻辑零件实例，包含它在平台上的位置 transform |
| **object** | `<resources><object id="...">` | 逻辑零件定义。一个 object 可被多个 build item 引用（例如 4 个 screw1） |
| **component** | `<object><components><component>` | object 内部的子网格引用。一个 object 可以有 1~N 个 component |
| **.model 文件** | `3D/Objects/object_*.model` | 实际的三角网格数据（XML：vertices + triangles） |
| **part** (Bambu) | `model_settings.config` `<part>` | Bambu Studio 扩展概念，与 component 对应，携带 name/extruder |

## 关键关系

```
build item 1 : N object
object       : N component  (1:1 或 1:N, 看是否有子零件)
component    1 : 1 .model 文件   (每个 component 指向一个 .model 文件里的一个 <object>)
.model 文件   1 : N object       (一个 .model 可以包含多个 <object id="...">)
```

## 为什么部分解出 21 个 Mesh

```
build items:  19
objects:      19  (每个 build item 对应一个 object)
components:   21  (17 个 object 有 1 个 component + 2 个 object 有 2 个 component)
flat meshes:  21  (三解器把每个 component 展平为一个 THREE.Mesh)
```
