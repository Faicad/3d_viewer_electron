import { defineConfig } from 'vitepress'
import pkg from '../../package.json'
import { FORMATS } from '../../scripts/format-data.mjs'
import { NAV, SIDEBAR } from '../../scripts/translations.mjs'

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

const UI_LABELS = {
  en: { docFooter: { prev: 'Previous page', next: 'Next page' }, outline: 'On this page', lastUpdated: 'Last updated', darkModeSwitch: 'Appearance', sidebarMenu: 'Menu', returnToTop: 'Return to top', langMenu: 'Language', lightModeSwitchTitle: 'Switch to light mode', darkModeSwitchTitle: 'Switch to dark mode' },
  zh: { docFooter: { prev: '上一页', next: '下一页' }, outline: '本页目录', lastUpdated: '最后更新', darkModeSwitch: '主题切换', sidebarMenu: '菜单', returnToTop: '返回顶部', langMenu: '语言', lightModeSwitchTitle: '切换到浅色模式', darkModeSwitchTitle: '切换到深色模式' },
  es: { docFooter: { prev: 'Página anterior', next: 'Página siguiente' }, outline: 'En esta página', lastUpdated: 'Última actualización', darkModeSwitch: 'Apariencia', sidebarMenu: 'Menú', returnToTop: 'Volver arriba', langMenu: 'Idioma', lightModeSwitchTitle: 'Cambiar a modo claro', darkModeSwitchTitle: 'Cambiar a modo oscuro' },
  ja: { docFooter: { prev: '前のページ', next: '次のページ' }, outline: 'このページの内容', lastUpdated: '最終更新', darkModeSwitch: '表示モード', sidebarMenu: 'メニュー', returnToTop: 'トップに戻る', langMenu: '言語', lightModeSwitchTitle: 'ライトモードに切り替え', darkModeSwitchTitle: 'ダークモードに切り替え' },
  ko: { docFooter: { prev: '이전 페이지', next: '다음 페이지' }, outline: '이 페이지의 내용', lastUpdated: '마지막 업데이트', darkModeSwitch: '테마', sidebarMenu: '메뉴', returnToTop: '맨 위로', langMenu: '언어', lightModeSwitchTitle: '라이트 모드로 전환', darkModeSwitchTitle: '다크 모드로 전환' },
  fr: { docFooter: { prev: 'Page précédente', next: 'Page suivante' }, outline: 'Sur cette page', lastUpdated: 'Dernière mise à jour', darkModeSwitch: 'Apparence', sidebarMenu: 'Menu', returnToTop: 'Retour en haut', langMenu: 'Langue', lightModeSwitchTitle: 'Passer en mode clair', darkModeSwitchTitle: 'Passer en mode sombre' },
  de: { docFooter: { prev: 'Vorherige Seite', next: 'Nächste Seite' }, outline: 'Auf dieser Seite', lastUpdated: 'Zuletzt aktualisiert', darkModeSwitch: 'Darstellung', sidebarMenu: 'Menü', returnToTop: 'Zurück zum Anfang', langMenu: 'Sprache', lightModeSwitchTitle: 'Zum hellen Modus wechseln', darkModeSwitchTitle: 'Zum dunklen Modus wechseln' },
  pt: { docFooter: { prev: 'Página anterior', next: 'Próxima página' }, outline: 'Nesta página', lastUpdated: 'Última atualização', darkModeSwitch: 'Aparência', sidebarMenu: 'Menu', returnToTop: 'Voltar ao topo', langMenu: 'Idioma', lightModeSwitchTitle: 'Mudar para modo claro', darkModeSwitchTitle: 'Mudar para modo escuro' },
  ru: { docFooter: { prev: 'Предыдущая страница', next: 'Следующая страница' }, outline: 'На этой странице', lastUpdated: 'Последнее обновление', darkModeSwitch: 'Оформление', sidebarMenu: 'Меню', returnToTop: 'Вернуться наверх', langMenu: 'Язык', lightModeSwitchTitle: 'Переключить на светлый режим', darkModeSwitchTitle: 'Переключить на тёмный режим' },
  ar: { docFooter: { prev: 'الصفحة السابقة', next: 'الصفحة التالية' }, outline: 'في هذه الصفحة', lastUpdated: 'آخر تحديث', darkModeSwitch: 'المظهر', sidebarMenu: 'القائمة', returnToTop: 'العودة إلى الأعلى', langMenu: 'اللغة', lightModeSwitchTitle: 'التبديل إلى الوضع الفاتح', darkModeSwitchTitle: 'التبديل إلى الوضع الداكن' },
  hi: { docFooter: { prev: 'पिछला पृष्ठ', next: 'अगला पृष्ठ' }, outline: 'इस पृष्ठ पर', lastUpdated: 'अंतिम अपडेट', darkModeSwitch: 'दृश्य', sidebarMenu: 'मेनू', returnToTop: 'ऊपर जाएँ', langMenu: 'भाषा', lightModeSwitchTitle: 'लाइट मोड पर स्विच करें', darkModeSwitchTitle: 'डार्क मोड पर स्विच करें' },
  id: { docFooter: { prev: 'Halaman sebelumnya', next: 'Halaman berikutnya' }, outline: 'Di halaman ini', lastUpdated: 'Terakhir diperbarui', darkModeSwitch: 'Tampilan', sidebarMenu: 'Menu', returnToTop: 'Kembali ke atas', langMenu: 'Bahasa', lightModeSwitchTitle: 'Beralih ke mode terang', darkModeSwitchTitle: 'Beralih ke mode gelap' },
  tr: { docFooter: { prev: 'Önceki sayfa', next: 'Sonraki sayfa' }, outline: 'Bu sayfada', lastUpdated: 'Son güncelleme', darkModeSwitch: 'Görünüm', sidebarMenu: 'Menü', returnToTop: 'Başa dön', langMenu: 'Dil', lightModeSwitchTitle: 'Açık moda geç', darkModeSwitchTitle: 'Koyu moda geç' },
  it: { docFooter: { prev: 'Pagina precedente', next: 'Pagina successiva' }, outline: 'In questa pagina', lastUpdated: 'Ultimo aggiornamento', darkModeSwitch: 'Aspetto', sidebarMenu: 'Menu', returnToTop: 'Torna su', langMenu: 'Lingua', lightModeSwitchTitle: 'Passa alla modalità chiara', darkModeSwitchTitle: 'Passa alla modalità scura' },
  nl: { docFooter: { prev: 'Vorige pagina', next: 'Volgende pagina' }, outline: 'Op deze pagina', lastUpdated: 'Laatst bijgewerkt', darkModeSwitch: 'Weergave', sidebarMenu: 'Menu', returnToTop: 'Terug naar boven', langMenu: 'Taal', lightModeSwitchTitle: 'Overschakelen naar lichte modus', darkModeSwitchTitle: 'Overschakelen naar donkere modus' },
  pl: { docFooter: { prev: 'Poprzednia strona', next: 'Następna strona' }, outline: 'Na tej stronie', lastUpdated: 'Ostatnia aktualizacja', darkModeSwitch: 'Wygląd', sidebarMenu: 'Menu', returnToTop: 'Powrót na górę', langMenu: 'Język', lightModeSwitchTitle: 'Przełącz na tryb jasny', darkModeSwitchTitle: 'Przełącz na tryb ciemny' },
  vi: { docFooter: { prev: 'Trang trước', next: 'Trang tiếp theo' }, outline: 'Trên trang này', lastUpdated: 'Cập nhật lần cuối', darkModeSwitch: 'Giao diện', sidebarMenu: 'Menu', returnToTop: 'Quay lại đầu trang', langMenu: 'Ngôn ngữ', lightModeSwitchTitle: 'Chuyển sang chế độ sáng', darkModeSwitchTitle: 'Chuyển sang chế độ tối' },
  th: { docFooter: { prev: 'หน้าก่อนหน้า', next: 'หน้าถัดไป' }, outline: 'ในหน้านี้', lastUpdated: 'อัปเดตล่าสุด', darkModeSwitch: 'ลักษณะ', sidebarMenu: 'เมนู', returnToTop: 'กลับไปด้านบน', langMenu: 'ภาษา', lightModeSwitchTitle: '切换到浅色模式', darkModeSwitchTitle: '切换到深色模式' },
  uk: { docFooter: { prev: 'Попередня сторінка', next: 'Наступна сторінка' }, outline: 'На цій сторінці', lastUpdated: 'Останнє оновлення', darkModeSwitch: 'Вигляд', sidebarMenu: 'Меню', returnToTop: 'Повернутися нагору', langMenu: 'Мова', lightModeSwitchTitle: 'Переключити на світлий режим', darkModeSwitchTitle: 'Переключити на темний режим' },
  sv: { docFooter: { prev: 'Föregående sida', next: 'Nästa sida' }, outline: 'På denna sida', lastUpdated: 'Senast uppdaterad', darkModeSwitch: 'Utseende', sidebarMenu: 'Meny', returnToTop: 'Tillbaka till toppen', langMenu: 'Språk', lightModeSwitchTitle: 'Växla till ljust läge', darkModeSwitchTitle: 'Växla till mörkt läge' },
}

function localesConfig() {
  const locales = {}
  for (const [code] of Object.entries(LANG_LABELS)) {
    const isRoot = code === 'en'
    const localeKey = isRoot ? 'root' : code
    const ui = UI_LABELS[code] || UI_LABELS.en
    locales[localeKey] = {
      label: LANG_LABELS[code].label,
      link: isRoot ? '/' : `/${code}/`,
      lang: LANG_LABELS[code].lang,
      dir: LANG_LABELS[code].dir || 'ltr',
      title: 'Faicad 3D Viewer',
      description: isRoot
        ? 'Cross-platform 3D model file viewer — supports 27+ 3D file formats including STL, GLB, STEP and more'
        : '跨平台 3D 模型文件查看器 — 支持 STL/GLB/STEP 等 27+ 种 3D 文件格式',
      themeConfig: {
        nav: nav(code),
        sidebar: sidebar(code),
        docFooter: ui.docFooter,
        outline: { label: ui.outline },
        lastUpdated: { text: ui.lastUpdated },
        darkModeSwitchLabel: ui.darkModeSwitch,
        sidebarMenuLabel: ui.sidebarMenu,
        returnToTopLabel: ui.returnToTop,
        langMenuLabel: ui.langMenu,
        lightModeSwitchTitle: ui.lightModeSwitchTitle,
        darkModeSwitchTitle: ui.darkModeSwitchTitle,
      },
    }
  }
  return locales
}

function nav(lang) {
  const p = lang === 'en' ? '' : `/${lang}`
  const t = NAV[lang] || NAV.en
  return [
    { text: t.home, link: p + '/' },
    { text: t.guide, link: p + '/guide/getting-started' },
    { text: t.features, link: p + '/features/overview' },
    { text: t.formats, link: p + '/formats/' },
    { text: 'GitHub', link: 'https://github.com/faicad/3d_viewer_electron' },
  ]
}

function sidebar(lang) {
  const prefix = lang === 'en' ? '' : `/${lang}`
  const t = SIDEBAR[lang] || SIDEBAR.en
  const navT = NAV[lang] || NAV.en

  const formatItems = FORMATS.map(f => ({
    text: `${f.label} (${f.extensions.join(', ')})`,
    link: `${prefix}/formats/${f.id}`,
  }))

  return {
    [`${prefix}/guide/`]: [
      {
        text: navT.guide,
        items: [
          { text: t.quickStart, link: `${prefix}/guide/getting-started` },
          { text: t.installation, link: `${prefix}/guide/installation` },
          { text: t.supportedFormats, link: `${prefix}/guide/supported-formats` },
          { text: t.keyboardShortcuts, link: `${prefix}/guide/keyboard-shortcuts` },
          { text: t.configuration, link: `${prefix}/guide/configuration` },
        ],
      },
    ],
    [`${prefix}/features/`]: [
      {
        text: navT.features,
        items: [
          { text: t.overview, link: `${prefix}/features/overview` },
          { text: t.stepSupport, link: `${prefix}/features/step-support` },
          { text: t.pbrRendering, link: `${prefix}/features/pbr-rendering` },
        ],
      },
    ],
    [`${prefix}/formats/`]: [
      {
        text: navT.formats,
        items: formatItems,
      },
    ],
  }
}

export default defineConfig({
  base: '/3d_viewer_electron/',
  title: 'Faicad 3D Viewer',
  description: 'Cross-platform 3D model file viewer — supports 27+ 3D file formats including STL, GLB, STEP and more',

  lang: 'en',
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

    nav: nav('en'),
    sidebar: sidebar('en'),
    docFooter: { prev: 'Previous page', next: 'Next page' },
    outline: { label: 'On this page' },
    lastUpdated: { text: 'Last updated' },
    darkModeSwitchLabel: 'Appearance',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Return to top',
    langMenuLabel: 'Language',
    lightModeSwitchTitle: 'Switch to light mode',
    darkModeSwitchTitle: 'Switch to dark mode',
  },
})
