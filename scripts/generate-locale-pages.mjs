import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { HERO, FEATURES, GUIDE } from './translations.mjs'

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

let count = 0
for (const code of LOCALE_CODES) {
  const dir = path.join(PAGES, code)
  fs.mkdirSync(dir, { recursive: true })

  const pages = [
    { file: 'index.md', content: pageContent(code) },
    { file: path.join('guide', 'getting-started.md'), content: guidePageContent(code) },
    { file: path.join('features', 'overview.md'), content: featuresPageContent(code) },
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
