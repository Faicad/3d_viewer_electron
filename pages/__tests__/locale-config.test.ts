import { describe, it, expect } from 'vitest'

const LANG_LABELS: Record<string, { label: string; lang: string; dir?: string }> = {
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

const ALL_CODES = Object.keys(LANG_LABELS) as (keyof typeof LANG_LABELS)[]

function buildLocale(langCode: string) {
  const isRoot = langCode === 'en'
  return {
    code: langCode,
    key: isRoot ? 'root' : langCode,
    link: isRoot ? '/' : `/${langCode}/`,
    label: LANG_LABELS[langCode]!.label,
    lang: LANG_LABELS[langCode]!.lang,
  }
}

function simulateGetLocaleForPath(relativePath: string): string {
  const matchingKey = ALL_CODES
    .filter((c) => c !== 'en')
    .find((c) => new RegExp(`/${c}/`).test(`/${relativePath}`))
  return matchingKey ? matchingKey : 'root'
}

const pagePaths: { relativePath: string; expectedLocale: string }[] = [
  { relativePath: 'index.md', expectedLocale: 'root' },
  { relativePath: 'guide/index.md', expectedLocale: 'root' },
  { relativePath: 'features/overview.md', expectedLocale: 'root' },
  { relativePath: 'formats/index.md', expectedLocale: 'root' },
]

for (const code of ALL_CODES.filter((c) => c !== 'en')) {
  pagePaths.push(
    { relativePath: `${code}/index.md`, expectedLocale: code },
    { relativePath: `${code}/guide/getting-started.md`, expectedLocale: code },
    { relativePath: `${code}/features/overview.md`, expectedLocale: code },
    { relativePath: `${code}/formats/stl.md`, expectedLocale: code },
  )
}

describe('Docs locale configuration', () => {
  it('has exactly 20 locales', () => {
    expect(ALL_CODES).toHaveLength(20)
  })

  it('has exactly 19 non-en locales', () => {
    const nonEn = ALL_CODES.filter((c) => c !== 'en')
    expect(nonEn).toHaveLength(19)
  })

  it('root locale uses key "root" with link "/"', () => {
    const en = buildLocale('en')
    expect(en.key).toBe('root')
    expect(en.link).toBe('/')
    expect(en.lang).toBe('en')
  })

  it('every non-en locale uses ISO code as key with correct link', () => {
    for (const code of ALL_CODES) {
      if (code === 'en') continue
      const locale = buildLocale(code)
      expect(locale.key).toBe(code)
      expect(locale.link).toBe(`/${code}/`)
    }
  })

  it('every non-en locale regex matches its own page paths and does not match others', () => {
    for (const code of ALL_CODES) {
      if (code === 'en') continue

      // Should match its own pages
      const ownPath = `/${code}/`
      const ownRegex = new RegExp(`/${code}/`)
      expect(ownRegex.test(ownPath)).toBe(true)

      // Should NOT match pages of other locales
      for (const otherCode of ALL_CODES) {
        if (otherCode === code || otherCode === 'en') continue
        const otherPath = `/${otherCode}/`
        expect(ownRegex.test(otherPath)).toBe(false)
      }
    }
  })

  it('getLocaleForPath resolves all page paths to correct locales', () => {
    for (const { relativePath, expectedLocale } of pagePaths) {
      const result = simulateGetLocaleForPath(relativePath)
      expect(result).toBe(expectedLocale)
    }
  })

  it('root locale only matches en pages (no locale prefix)', () => {
    const rootPages = pagePaths.filter((p) => p.expectedLocale === 'root')
    expect(rootPages.length).toBeGreaterThan(3)
    for (const page of rootPages) {
      expect(page.relativePath.startsWith('en/')).toBe(false)
      for (const code of ALL_CODES.filter((c) => c !== 'en')) {
        expect(page.relativePath.startsWith(`${code}/`)).toBe(false)
      }
    }
  })

  it('no duplicate labels across 20 locales', () => {
    const labels = ALL_CODES.map((c) => LANG_LABELS[c]!.label)
    const unique = new Set(labels)
    expect(unique.size).toBe(labels.length)
  })

  it('each locale has a valid lang code', () => {
    for (const code of ALL_CODES) {
      expect(code).toBeTruthy()
      expect(LANG_LABELS[code]!.lang.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('ar locale has rtl direction', () => {
    expect(LANG_LABELS.ar?.dir).toBe('rtl')
  })

  it('every non-en locale link starts with / and ends with /', () => {
    for (const code of ALL_CODES) {
      if (code === 'en') continue
      const locale = buildLocale(code)
      expect(locale.link.startsWith('/')).toBe(true)
      expect(locale.link.endsWith('/')).toBe(true)
    }
  })

  it('en locale link is just "/"', () => {
    const en = buildLocale('en')
    expect(en.link).toBe('/')
  })

  it('all 20 locale links are unique', () => {
    const links = ALL_CODES.map((c) => buildLocale(c).link)
    const unique = new Set(links)
    expect(unique.size).toBe(links.length)
  })
})
