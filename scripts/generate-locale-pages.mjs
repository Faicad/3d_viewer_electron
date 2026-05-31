import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { HERO, FEATURES, GUIDE } from './translations.mjs'
import { FORMATS, FORMAT_GROUPS } from './format-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PAGES = path.resolve(ROOT, 'pages')

const LOCALE_CODES = ['zh', 'es', 'ja', 'ko', 'fr', 'de', 'pt', 'ru', 'ar', 'hi', 'id', 'tr', 'it', 'nl', 'pl', 'vi', 'th', 'uk', 'sv']
const FEATURE_ICONS = ['🚀', '🎨', '🖱️', '📂', '🌓', '🌐']

function featuresYaml(lang) {
  const items = FEATURES[lang] || FEATURES.en
  return items.map((f, i) =>
    `  - icon: ${FEATURE_ICONS[i] || '🚀'}\n    title: ${f.title}\n    details: ${f.details}`
  ).join('\n')
}

function pageContent(code) {
  const hero = HERO[code] || HERO.en
  return [
    '---',
    'layout: home',
    '',
    'hero:',
    "  name: 'Faicad 3D Viewer'",
    `  text: '${hero.text}'`,
    `  tagline: '${hero.tagline}'`,
    '  actions:',
    '    - theme: brand',
    `      text: ${hero.getStarted}`,
    `      link: /${code}/guide/getting-started`,
    '    - theme: alt',
    '      text: GitHub',
    '      link: https://github.com/faicad/3d_viewer_electron',
    '',
    'features:',
    featuresYaml(code),
    '---',
    '',
  ].join('\n')
}

function guidePageContent(code) {
  const g = GUIDE[code] || GUIDE.en
  return `# ${g.title}

${g.para1}

${g.para2}

${g.para3}
`
}

function featuresPageContent(code) {
  const items = FEATURES[code] || FEATURES.en
  const lines = ['# Features\n']
  for (let i = 0; i < items.length; i++) {
    const f = items[i]
    const icon = FEATURE_ICONS[i] || '🚀'
    lines.push(`## ${icon} ${f.title}`)
    lines.push('')
    lines.push(f.details)
    lines.push('')
  }
  return lines.join('\n')
}

function formatsPageContent(code) {
  const groupLabel = (g) => {
    const entry = FORMAT_GROUPS[g]
    return entry ? (entry[code] || entry.en) : g
  }

  const links = FORMATS.map(f =>
    `- [${f.label}](${f.id}) — \`${f.extensions.join(', ')}\` — ${groupLabel(f.group)}`
  ).join('\n')

  const titleMap = {
    zh: '支持的格式', es: 'Formatos compatibles', ja: '対応フォーマット', ko: '지원 형식',
    fr: 'Formats supportés', de: 'Unterstützte Formate', pt: 'Formatos compatíveis',
    ru: 'Поддерживаемые форматы', ar: 'الصيغ المدعومة', hi: 'समर्थित फ़ॉर्मेट',
    id: 'Format yang didukung', tr: 'Desteklenen biçimler', it: 'Formati supportati',
    nl: 'Ondersteunde formaten', pl: 'Obsługiwane formaty', vi: 'Định dạng hỗ trợ',
    th: 'รูปแบบที่รองรับ', uk: 'Підтримувані формати', sv: 'Format som stöds',
  }
  const title = titleMap[code] || 'Supported Formats'

  const descMap = {
    zh: '查看 Faicad 3D Viewer 支持的所有文件格式的详细介绍。',
    es: 'Explore todos los formatos de archivo compatibles con Faicad 3D Viewer.',
    ja: 'Faicad 3D Viewer が対応するすべてのファイル形式の詳細をご覧ください。',
    ko: 'Faicad 3D Viewer가 지원하는 모든 파일 형식의 세부 정보를 확인하세요.',
  }
  const desc = descMap[code] || 'Browse details for all file formats supported by Faicad 3D Viewer.'

  return `# ${title}

${desc}

${links}
`
}

let count = 0
for (const code of LOCALE_CODES) {
  const dir = path.join(PAGES, code)
  fs.mkdirSync(dir, { recursive: true })

  const pages = [
    { file: 'index.md', content: pageContent(code) },
    { file: path.join('guide', 'getting-started.md'), content: guidePageContent(code) },
    { file: path.join('features', 'overview.md'), content: featuresPageContent(code) },
    { file: path.join('formats', 'index.md'), content: formatsPageContent(code) },
  ]

  for (const p of pages) {
    const fp = path.join(dir, p.file)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, p.content, 'utf-8')
    console.log('  ' + fp)
    count++
  }
}

console.log('Generated ' + count + ' locale pages across ' + LOCALE_CODES.length + ' locales.')
