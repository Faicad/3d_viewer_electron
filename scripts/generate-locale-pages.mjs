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

function videoHtml(code) {
  if (code !== 'zh') return ''
  return `<div style="text-align:center;padding:48px 24px 64px">
  <h2 style="font-size:1.8rem;font-weight:600;margin-bottom:8px">📺 介绍视频</h2>
  <p style="color:var(--vp-c-text-2);margin-bottom:32px">一分钟了解 Faicad 3D Viewer</p>
  <a href="https://www.douyin.com/user/self?modal_id=7657063273283472682&showSubTab=compilation" target="_blank" rel="noopener noreferrer" style="display:inline-block;position:relative;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12);max-width:640px;width:100%;background:#1a1a2e;aspect-ratio:16/9;transition:transform 0.2s;text-decoration:none;color:#fff" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
    <div style="display:flex;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#1a1a2e,#16213e)">
      <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.9">
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" fill="rgba(255,255,255,0.08)"/>
        <polygon points="10,8 16,12 10,16" fill="#fff"/>
      </svg>
      <div style="position:absolute;bottom:16px;left:16px;right:16px;display:flex;justify-content:space-between;font-size:0.85rem;color:rgba(255,255,255,0.7)">
        <span>📱 抖音</span>
        <span>Faicad 3D Viewer</span>
      </div>
    </div>
  </a>
</div>`
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
    `      text: ${hero.download}`,
    `      link: ${hero.downloadLink}`,
    '',
    'features:',
    featuresYaml(code),
    '---',
    '',
    videoHtml(code),
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
