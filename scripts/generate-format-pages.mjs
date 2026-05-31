import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { FORMATS, FORMAT_GROUPS, RENDER_HINT_LABELS } from './format-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PAGES = path.resolve(ROOT, 'pages')

const ALL_LOCALES = ['zh', 'en', 'es', 'ja', 'ko', 'fr', 'de', 'pt', 'ru', 'ar', 'hi', 'id', 'tr', 'it', 'nl', 'pl', 'vi', 'th', 'uk', 'sv']

function langDir(lang) {
  return lang === 'zh' ? PAGES : path.join(PAGES, lang)
}

function formatsDir(lang) {
  return path.join(langDir(lang), 'formats')
}

function getLabel(obj, lang) {
  return obj[lang] || obj.en
}

function getDescription(f, lang) {
  if (lang === 'zh') return f.zh.description
  return f.en.description
}

function pageContent(f, lang) {
  const exts = f.extensions.join(', ')
  const groupLabel = getLabel(FORMAT_GROUPS[f.group], lang)
  const renderHintLabel = getLabel(RENDER_HINT_LABELS[f.renderHint], lang)
  const desc = getDescription(f, lang)

  const screenshotPath = path.resolve(ROOT, 'pages', 'public', 'screenshots', 'formats', `${f.id}.png`)
  const hasScreenshot = fs.existsSync(screenshotPath)

  const features = lang === 'zh' ? [
    '拖拽加载：直接将文件拖入应用窗口',
    '点击上传：通过文件对话框选择',
    '剪贴板粘贴：复制文件后 Ctrl+V',
    'OrbitControls：旋转 / 平移 / 缩放',
    '场景树：层次化展示模型结构',
    '模型导出：下载为 STL 或 GLB',
  ] : [
    'Drag & drop: drag files directly into the window',
    'Click to upload: select via file dialog',
    'Clipboard paste: Ctrl+V after copying',
    'OrbitControls: rotate / pan / zoom',
    'Scene tree: hierarchical model structure',
    'Model export: download as STL or GLB',
  ]

  const specificFeatures = (() => {
    if (f.renderHint === 'skeleton') {
      return lang === 'zh'
        ? ['骨架动画渲染', '骨骼层次展示']
        : ['Skeleton animation rendering', 'Bone hierarchy display']
    }
    if (f.renderHint === 'pointcloud') {
      return lang === 'zh'
        ? ['点云渲染方式', '每点颜色渲染（如包含）']
        : ['Point cloud rendering', 'Per-point color rendering (if available)']
    }
    if (f.renderHint === 'volume') {
      return lang === 'zh'
        ? ['体数据渲染', '代理立方体显示']
        : ['Volume rendering', 'Proxy cube display']
    }
    if (f.renderHint === 'toolpath') {
      return lang === 'zh'
        ? ['线段的刀具路径渲染', '逐层显示']
        : ['Line segment toolpath rendering', 'Layer-by-layer display']
    }
    if (f.group === 'cad') {
      return lang === 'zh'
        ? ['拓扑结构保留（面/边/顶点）', '线框/实体+线框显示模式', '单位自动识别']
        : ['Topology preservation (faces/edges/vertices)', 'Wireframe / solid+wireframe modes', 'Unit auto-detection']
    }
    return lang === 'zh'
      ? ['PBR 材质渲染', '标准三角网格显示']
      : ['PBR material rendering', 'Standard triangle mesh display']
  })()

  const screenshotSection = hasScreenshot
    ? `\n## ${lang === 'zh' ? '截图' : 'Screenshot'}\n\n![${f.label}](/screenshots/formats/${f.id}.png)\n`
    : ''

  return `---
sidebar: false
---

# ${f.label} — ${groupLabel}

${desc}

## ${lang === 'zh' ? '基本信息' : 'Format Info'}

| ${lang === 'zh' ? '属性' : 'Property'} | ${lang === 'zh' ? '值' : 'Value'} |
| --- | --- |
| ${lang === 'zh' ? '扩展名' : 'Extensions'} | \`${exts}\` |
| ${lang === 'zh' ? '分类' : 'Category'} | ${groupLabel} |
| ${lang === 'zh' ? '渲染方式' : 'Render Type'} | ${renderHintLabel} |

## ${lang === 'zh' ? '支持的特性' : 'Supported Features'}

${specificFeatures.map(f => `- ${f}`).join('\n')}

### ${lang === 'zh' ? '通用功能' : 'General Features'}

${features.map(f => `- ${f}`).join('\n')}
${screenshotSection}
`
}

// Generate pages for each format × locale
for (const f of FORMATS) {
  for (const lang of ALL_LOCALES) {
    const dir = formatsDir(lang)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${f.id}.md`)
    fs.writeFileSync(filePath, pageContent(f, lang), 'utf-8')
  }
}

// Generate index page per locale
for (const lang of ALL_LOCALES) {
  const title = lang === 'zh' ? '支持的格式' : 'Supported Formats'
  const desc = lang === 'zh'
    ? '查看 Faicad 3D Viewer 支持的所有文件格式的详细介绍。'
    : 'Browse details for all file formats supported by Faicad 3D Viewer.'

  const links = FORMATS.map(f => {
    const groupLabel = getLabel(FORMAT_GROUPS[f.group], lang)
    return `- [${f.label}](${f.id}) — \`${f.extensions.join(', ')}\` — ${groupLabel}`
  }).join('\n')

  const content = `# ${title}

${desc}

${links}
`
  const filePath = path.join(formatsDir(lang), 'index.md')
  fs.writeFileSync(filePath, content, 'utf-8')
}

console.log('✅ Format pages generated for ' + ALL_LOCALES.length + ' locales.')
