# 独立 .model 文件查看功能

## 需求

直接打开磁盘上已解压的 `.model` 文件（如 `object_6.model`），解析 XML 网格数据，在 3D 视口中渲染。

不是从 3MF ZIP 解压 — 文件已经在文件系统上。
参考目录：C:\my\Ficad\3d_viewer_electron\src\test\fixtures\vise\3D\Objects

---

## 实现方案

### Step 1：注册 `.model` 格式

`src/renderer/config/file-formats.ts`

- `FormatId` 增加 `'model'`
- `FILE_FORMATS` 增加一个条目：

```typescript
{
  id: 'model',
  label: '3MF Model',
  extensions: ['.model'],
  loaderModule: '',
  group: 'other',
  sampleFile: '',
  textBased: true,
  needsDracoWasm: false,
  needsExternalDep: false,
  renderHint: 'mesh',
  defaultUnit: 'millimeter',
  color: 'text-orange-300',
}
```

注册后 `detectFormat`、`ALL_EXTENSIONS`、`FORMAT_MAP`、`ALL_ACCEPT` 等自动支持 `.model`。

### Step 2：实现 Loader

`src/renderer/engine/formatLoaders.ts` — 增加 `case 'model'`：

解析 XML → 提取 `<vertices>` 和 `<triangles>` → 构建 `THREE.BufferGeometry` + `THREE.Mesh`

`.model` XML 结构（含命名空间）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
       xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"
       requiredextensions="p">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="..." y="..." z="..."/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>
```

Loader 逻辑：
1. `const text = bufferToText(buffer)` — 文本解码（`textBased: true`）
2. 解析 XML：推荐 `DOMParser`；注意默认命名空间 `xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"`，需用 `getElementsByTagNameNS` 或正则读取元素。直接 `getElementsByTagName` 会因命名空间找不到元素。
3. 读取 `<vertices>/<vertex>` → `Float32Array`
4. 读取 `<triangles>/<triangle>` → `Uint32Array`（index）
5. 构造 `BufferGeometry` → `geometry.computeVertexNormals()` → `THREE.Mesh`
6. 从 `<model unit="...">` 解析单位，设置 `sourceUnit`（兜底 `defaultUnit: 'millimeter'`）
7. 如果多个 `<object>`，全部返回

### Step 3：FileListPanel 支持

FileListPanel 的 `readDirectory` 已经会列出所有文件。`.model` 文件注册后会自动出现在文件列表中，点击即可加载渲染。

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/renderer/config/file-formats.ts` | `FormatId` + `FILE_FORMATS` 增加 `model` |
| `src/renderer/engine/formatLoaders.ts` | 新增 `case 'model'` loader |

---

## 不涉及

- 不需要修改 `parseBambu3mf` / `Bambu3mfMetadata`
- 不需要 ZIP 解压逻辑
- 不需要新的 UI 面板或右键菜单
- 不需要修改场景树
