import { defineConfig } from 'vitepress'
import pkg from '../../package.json'
import { FORMATS, FORMAT_GROUPS } from '../../scripts/format-data.mjs'

const LANG_LABELS = {
  zh: { label: '中文', lang: 'zh-CN' },
  en: { label: 'English', lang: 'en' },
  es: { label: 'Español', lang: 'es' },
  ja: { label: '日本語', lang: 'ja' },
  ko: { label: '한국어', lang: 'ko' },
  fr: { label: 'Français', lang: 'fr' },
  de: { label: 'Deutsch', lang: 'de' },
  pt: { label: 'Português', lang: 'pt' },
  ru: { label: 'Русский', lang: 'ru' },
  ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
  hi: { label: 'हिन्दी', lang: 'hi' },
  id: { label: 'Bahasa Indonesia', lang: 'id' },
  tr: { label: 'Türkçe', lang: 'tr' },
  it: { label: 'Italiano', lang: 'it' },
  nl: { label: 'Nederlands', lang: 'nl' },
  pl: { label: 'Polski', lang: 'pl' },
  vi: { label: 'Tiếng Việt', lang: 'vi' },
  th: { label: 'ไทย', lang: 'th' },
  uk: { label: 'Українська', lang: 'uk' },
  sv: { label: 'Svenska', lang: 'sv' },
}

function fmt(f, lang) {
  if (lang === 'zh') return f.zh
  // For non-zh languages, use English as fallback
  return f.en
}

function localesConfig() {
  const locales = {}
  for (const [code, _info] of Object.entries(LANG_LABELS)) {
    const isZh = code === 'zh'
    const pfx = isZh ? '' : `/${code}`
    locales[isZh ? '/' : `/${code}/`] = {
      label: LANG_LABELS[code].label,
      lang: LANG_LABELS[code].lang,
      dir: LANG_LABELS[code].dir || 'ltr',
      title: 'Faicad 3D Viewer',
      description: isZh
        ? '跨平台 3D 模型文件查看器 — 支持 STL/GLB/STEP 等 27+ 种 3D 文件格式'
        : 'Cross-platform 3D model file viewer — supports 27+ 3D file formats including STL, GLB, STEP and more',
      themeConfig: {
        nav: nav(code),
        sidebar: sidebar(code),
        docFooter: isZh ? { prev: '上一页', next: '下一页' } : undefined,
        outline: { label: isZh ? '本页目录' : 'On this page' },
        lastUpdated: { text: isZh ? '最后更新' : 'Last updated' },
        darkModeSwitchLabel: isZh ? '主题切换' : 'Appearance',
        sidebarMenuLabel: isZh ? '菜单' : 'Menu',
        returnToTopLabel: isZh ? '返回顶部' : 'Return to top',
        langMenuLabel: isZh ? '语言' : 'Language',
        lightModeSwitchTitle: isZh ? '切换到浅色模式' : 'Switch to light mode',
        darkModeSwitchTitle: isZh ? '切换到深色模式' : 'Switch to dark mode',
      },
    }
  }
  return locales
}

function nav(lang) {
  const p = lang === 'zh' ? '' : `/${lang}`
  const guideLabel = lang === 'zh' ? '入门指南' : 'Guide'
  const featuresLabel = lang === 'zh' ? '功能特性' : 'Features'
  const formatsLabel = lang === 'zh' ? '文件格式' : 'Formats'
  return [
    { text: lang === 'zh' ? '首页' : 'Home', link: p + '/' },
    { text: guideLabel, link: p + '/guide/getting-started' },
    { text: featuresLabel, link: p + '/features/overview' },
    { text: formatsLabel, link: p + '/formats/' },
    { text: 'GitHub', link: 'https://github.com/faicad/3d_viewer_electron' },
  ]
}

function sidebar(lang) {
  const guideLabel = lang === 'zh' ? '入门指南' : 'Guide'
  const featuresLabel = lang === 'zh' ? '功能特性' : 'Features'
  const formatsLabel = lang === 'zh' ? '文件格式' : 'Formats'
  const prefix = lang === 'zh' ? '' : `/${lang}`

  const formatItems = FORMATS.map(f => ({
    text: `${f.label} (${f.extensions.join(', ')})`,
    link: `${prefix}/formats/${f.id}`,
  }))

  return {
    [`${prefix}/guide/`]: [
      {
        text: guideLabel,
        items: [
          { text: lang === 'zh' ? '快速开始' : 'Getting Started', link: `${prefix}/guide/getting-started` },
          { text: lang === 'zh' ? '安装与下载' : 'Installation', link: `${prefix}/guide/installation` },
          { text: lang === 'zh' ? '支持的文件格式' : 'Supported Formats', link: `${prefix}/guide/supported-formats` },
          { text: lang === 'zh' ? '键盘快捷键' : 'Keyboard Shortcuts', link: `${prefix}/guide/keyboard-shortcuts` },
          { text: lang === 'zh' ? '配置与主题' : 'Configuration', link: `${prefix}/guide/configuration` },
        ],
      },
    ],
    [`${prefix}/features/`]: [
      {
        text: featuresLabel,
        items: [
          { text: lang === 'zh' ? '功能概览' : 'Overview', link: `${prefix}/features/overview` },
          { text: lang === 'zh' ? 'STEP 文件支持' : 'STEP Support', link: `${prefix}/features/step-support` },
          { text: lang === 'zh' ? 'PBR 渲染系统' : 'PBR Rendering', link: `${prefix}/features/pbr-rendering` },
        ],
      },
    ],
    [`${prefix}/formats/`]: [
      {
        text: formatsLabel,
        items: formatItems,
      },
    ],
  }
}

export default defineConfig({
  base: '/3d_viewer_electron/',
  title: 'Faicad 3D Viewer',
  description: '跨平台 3D 模型文件查看器 — 支持 STL/GLB/STEP 等 27+ 种 3D 文件格式',

  lang: 'zh-CN',
  locales: localesConfig(),

  head: [
    ['meta', { name: 'keywords', content: '3D viewer, STL viewer, STEP viewer, GLB viewer, 3D model viewer, CAD viewer, Three.js, Electron, faicad' }],
    ['meta', { property: 'og:title', content: 'Faicad 3D Viewer' }],
    ['meta', { property: 'og:description', content: 'Cross-platform 3D model file viewer supporting 27+ formats including STL, GLB, STEP, OBJ, FBX' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://faicad.github.io/3d_viewer_electron/' }],
    ['meta', { name: 'robots', content: 'index, follow' }],
    ['link', { rel: 'canonical', href: 'https://faicad.github.io/3d_viewer_electron/' }],
  ],

  lastUpdated: true,
  cleanUrls: true,

  sitemap: {
    hostname: 'https://faicad.github.io/3d_viewer_electron/',
  },

  themeConfig: {
    siteTitle: 'Faicad 3D Viewer',
    logo: '/favicon.svg',

    search: { provider: 'local' },

    footer: {
      message: `v${pkg.version} — LGPL-2.0`,
      copyright: `Copyright © ${new Date().getFullYear()} Faicad`,
    },
  },
})
