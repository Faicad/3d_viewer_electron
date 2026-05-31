import { test, expect } from '@playwright/test'

const BASE = '/3d_viewer_electron'

interface LangEntry {
  code: string
  label: string
  link: string
}

const ALL_LANGS: LangEntry[] = [
  { code: 'en', label: 'English', link: `${BASE}/` },
  { code: 'zh', label: '中文', link: `${BASE}/zh/` },
  { code: 'es', label: 'Español', link: `${BASE}/es/` },
  { code: 'ja', label: '日本語', link: `${BASE}/ja/` },
  { code: 'ko', label: '한국어', link: `${BASE}/ko/` },
  { code: 'fr', label: 'Français', link: `${BASE}/fr/` },
  { code: 'de', label: 'Deutsch', link: `${BASE}/de/` },
  { code: 'pt', label: 'Português', link: `${BASE}/pt/` },
  { code: 'ru', label: 'Русский', link: `${BASE}/ru/` },
  { code: 'ar', label: 'العربية', link: `${BASE}/ar/` },
  { code: 'hi', label: 'हिन्दी', link: `${BASE}/hi/` },
  { code: 'id', label: 'Bahasa Indonesia', link: `${BASE}/id/` },
  { code: 'tr', label: 'Türkçe', link: `${BASE}/tr/` },
  { code: 'it', label: 'Italiano', link: `${BASE}/it/` },
  { code: 'nl', label: 'Nederlands', link: `${BASE}/nl/` },
  { code: 'pl', label: 'Polski', link: `${BASE}/pl/` },
  { code: 'vi', label: 'Tiếng Việt', link: `${BASE}/vi/` },
  { code: 'th', label: 'ไทย', link: `${BASE}/th/` },
  { code: 'uk', label: 'Українська', link: `${BASE}/uk/` },
  { code: 'sv', label: 'Svenska', link: `${BASE}/sv/` },
]

const NON_EN_LANGS = ALL_LANGS.filter((l) => l.code !== 'en')
const TRANS = '.VPNavBarTranslations'

async function openSwitcher(page: any) {
  await page.locator(`${TRANS} button`).click()
}

async function clickLanguage(page: any, label: string) {
  const link = page.locator(`${TRANS} .VPMenuLink a`, { hasText: label })
  await expect(link).toBeVisible()
  await link.click()
}

async function verifyPageLoaded(page: any, expectedUrl: string) {
  await page.waitForURL(`**${expectedUrl}`)
  await expect(page.locator(TRANS)).toBeVisible({ timeout: 10000 })
  const body = page.locator('body')
  await expect(body).not.toContainText('404')
  await expect(body).not.toContainText('Page Not Found')
}

test.describe('Docs language switching - all 20 languages', () => {

  test('1: language switcher renders on English homepage with all 19 non-English entries', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator(TRANS)).toBeVisible()

    await openSwitcher(page)
    const links = page.locator(`${TRANS} .VPMenuLink a`)
    await expect(links).toHaveCount(19)

    const texts = await links.allTextContents()
    for (const lang of NON_EN_LANGS) {
      expect(texts).toContain(lang.label)
    }
  })

  test('2: language switcher on Chinese page shows en + 18 other locales', async ({ page }) => {
    await page.goto(`${BASE}/zh/`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator(TRANS)).toBeVisible()

    await openSwitcher(page)
    await expect(page.locator(`${TRANS} .VPMenuLink a`)).toHaveCount(19)
  })

  test('3: every non-English language link on English homepage has correct href', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    await openSwitcher(page)

    for (const lang of NON_EN_LANGS) {
      const link = page.locator(`${TRANS} .VPMenuLink a`, { hasText: lang.label })
      await expect(link).toBeVisible()
      const href = await link.getAttribute('href')
      expect(href).toBe(lang.link)
    }
  })

  test('4: clicking each non-English language from homepage loads the locale page (not 404)', async ({ page }) => {
    for (const lang of NON_EN_LANGS) {
      await page.goto(`${BASE}/`)
      await expect(page.locator(TRANS)).toBeVisible()

      await openSwitcher(page)
      await clickLanguage(page, lang.label)

      await verifyPageLoaded(page, lang.link)
      await expect(page.locator('.VPNavBarTitle')).toBeVisible()
    }
  })

  test('5: clicking root locale link from Chinese page loads English homepage', async ({ page }) => {
    await page.goto(`${BASE}/zh/`)
    await page.waitForLoadState('networkidle')
    await openSwitcher(page)

    const enLink = page.locator(`${TRANS} .VPMenuLink a`, { hasText: 'English' })
    await expect(enLink).toBeVisible()
    expect(await enLink.getAttribute('href')).toBe(`${BASE}/`)

    await enLink.click()
    await verifyPageLoaded(page, `${BASE}/`)

    // After switching to English, nav should show English labels
    await expect(page.locator('.VPNavBarMenu a').first()).toContainText('Home')
  })

  test('6: all locale links in switcher have no double slashes', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    await openSwitcher(page)

    const links = await page.locator(`${TRANS} .VPMenuLink a`).all()
    for (const link of links) {
      const href = await link.getAttribute('href')
      expect(href).toBeTruthy()
      expect(href).not.toContain('//')
    }
  })

  test('7: corresponding links from guide page keep the same page path in each locale', async ({ page }) => {
    await page.goto(`${BASE}/guide/getting-started`)
    await page.waitForLoadState('networkidle')
    await openSwitcher(page)

    for (const lang of NON_EN_LANGS) {
      const link = page.locator(`${TRANS} .VPMenuLink a`, { hasText: lang.label })
      await expect(link).toBeVisible()
      expect(await link.getAttribute('href')).toBe(`${BASE}/${lang.code}/guide/getting-started`)
    }
  })

  test('8: clicking each non-English corresponding link from guide page loads the page', async ({ page }) => {
    for (const lang of NON_EN_LANGS) {
      await page.goto(`${BASE}/guide/getting-started`)
      await expect(page.locator(TRANS)).toBeVisible()

      await openSwitcher(page)
      await clickLanguage(page, lang.label)

      await verifyPageLoaded(page, `${BASE}/${lang.code}/guide/getting-started`)
    }
  })

  test('9: switching from Chinese guide page to English root guide loads correctly', async ({ page }) => {
    await page.goto(`${BASE}/zh/guide/getting-started`)
    await page.waitForLoadState('networkidle')
    await openSwitcher(page)

    const enLink = page.locator(`${TRANS} .VPMenuLink a`, { hasText: 'English' })
    await expect(enLink).toBeVisible()
    expect(await enLink.getAttribute('href')).toBe(`${BASE}/guide/getting-started`)

    await enLink.click()
    await verifyPageLoaded(page, `${BASE}/guide/getting-started`)
  })

})
