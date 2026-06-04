import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const BASE = '/3d_viewer_electron'
const PAGES_DIR = path.resolve(import.meta.dirname, '..')

const SKIP_DIRS = new Set(['node_modules', '.vitepress', '.pnpm', '__tests__', 'e2e', 'public'])

function discoverPages(): string[] {
  const pages: string[] = []

  function scanDir(dirPath: string, urlPrefix: string) {
    let entries: string[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          scanDir(path.join(dirPath, entry.name), `${urlPrefix}/${entry.name}`)
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const name = entry.name.replace(/\.md$/, '')
        if (name === 'index') {
          pages.push(`${BASE}${urlPrefix}/`)
        } else {
          pages.push(`${BASE}${urlPrefix}/${name}`)
        }
      }
    }
  }

  scanDir(PAGES_DIR, '')
  return [...new Set(pages)]
}

const ALL_PAGES = discoverPages()
const PAGE_SET = new Set(ALL_PAGES)

test.describe('Every discovered page returns HTTP 200', () => {
  const locales: { code: string; pages: string[] }[] = []

  const localeDirs = fs.readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name) && /^[a-z]{2}(-[a-z]+)?$/.test(e.name))
    .map(e => e.name)

  const ROOT_PAGES = ALL_PAGES.filter(p => !localeDirs.some(l => p.includes(`/${l}/`)))

  locales.push({ code: 'en', pages: ROOT_PAGES })

  for (const locale of localeDirs.sort()) {
    const localePages = ALL_PAGES.filter(p => p.includes(`/${locale}/`))
    if (localePages.length > 0) {
      locales.push({ code: locale, pages: localePages })
    }
  }

  for (const { code, pages } of locales) {
    test(`${code}: ${pages.length} pages accessible`, async ({ request }, testInfo) => {
      testInfo.setTimeout(120000)
      const failures: string[] = []
      for (const url of pages) {
        const res = await request.get(url)
        if (res.status() !== 200) {
          failures.push(`${url} → ${res.status()}`)
        }
      }
      expect(failures, `Broken pages:\n${failures.join('\n')}`).toEqual([])
    })
  }
})

test.describe('Internal links on sample pages all resolve', () => {
  const SAMPLES = [
    `${BASE}/`,
    `${BASE}/guide/getting-started`,
    `${BASE}/features/overview`,
    `${BASE}/toolbar/`,
    `${BASE}/toolbar/open-file`,
    `${BASE}/formats/`,
    `${BASE}/formats/step`,
    `${BASE}/zh/`,
    `${BASE}/zh/guide/getting-started`,
  ]

  for (const pageUrl of SAMPLES) {
    test(`every internal link on ${pageUrl} exists`, async ({ page }) => {
      await page.goto(pageUrl, { waitUntil: 'networkidle' })
      const links = await page.locator('a').all()
      const bad: string[] = []

      for (const el of links) {
        const href = await el.getAttribute('href')
        if (!href) continue
        if (/^(https?:\/\/|mailto:|tel:|#|javascript:)/.test(href)) continue

        let abs: string
        if (href.startsWith('/')) {
          abs = href.replace(/\/+$/, '') || '/'
        } else {
          abs = new URL(href, page.url()).pathname
        }

        if (abs.startsWith(BASE)) {
          const key = abs.replace(/\/+$/, '') || abs
          if (!PAGE_SET.has(key) && !PAGE_SET.has(key + '/')) {
            bad.push(abs)
          }
        }
      }

      expect(bad, `Broken links on ${pageUrl}:\n${bad.join('\n')}`).toEqual([])
    })
  }
})

test.describe('Footer GitHub link', () => {
  test('present on English homepage with correct attributes', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    const link = page.locator('footer a', { hasText: 'GitHub' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://github.com/faicad/3d_viewer_electron')
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('present on every locale homepage', async ({ page }) => {
    const localeDirs = fs.readdirSync(PAGES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^[a-z]{2}(-[a-z]+)?$/.test(e.name))
      .map(e => e.name)
      .sort()

    for (const locale of localeDirs) {
      const url = `${BASE}/${locale}/`
      await page.goto(url, { waitUntil: 'networkidle' })
      await expect(page.locator('footer a', { hasText: 'GitHub' }),
        `Missing footer GitHub on ${url}`).toBeVisible()
    }
  })
})
