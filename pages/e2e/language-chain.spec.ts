import { test, expect } from '@playwright/test'

const BASE = '/3d_viewer_electron'

const SEQUENCE = [
  '中文', 'Español', '日本語', '한국어', 'Français', 'Deutsch',
  'Português', 'Русский', 'العربية', 'हिन्दी', 'Bahasa Indonesia',
  'Türkçe', 'Italiano', 'Nederlands', 'Polski', 'Tiếng Việt',
  'ไทย', 'Українська', 'Svenska', 'English',
]

const NON_EN_ONLY = SEQUENCE.filter(l => l !== 'English')
const TRANS = '.VPNavBarTranslations'

async function openSwitcher(page: any) {
  await page.locator(`${TRANS} button`).click()
  await expect(page.locator(`${TRANS} .VPMenuLink a`).first()).toBeVisible()
}

async function clickLanguage(page: any, label: string) {
  await page.locator(`${TRANS} .VPMenuLink a`, { hasText: label }).click()
}

async function verifyNo404(page: any) {
  await expect(page.locator('body')).not.toContainText(/404|Page Not Found|Not Found/i)
  const path = new URL(page.url()).pathname
  expect(path).not.toContain('viewer_electron/viewer_electron')
  expect(path).not.toContain('//')
}

const NAV = '.VPNavBarMenu a'

test.describe('Language switching chain — sequential clicks without page reload', () => {
  const scenarios: { name: string; url: string }[] = [
    { name: 'homepage', url: `${BASE}/` },
    { name: 'toolbar category page', url: `${BASE}/toolbar/` },
    { name: 'inner page (guide/installation)', url: `${BASE}/guide/installation` },
  ]

  for (const { name, url } of scenarios) {
    test(`start on ${name}, click through all ${SEQUENCE.length} languages sequentially`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'networkidle' })
      await expect(page.locator(NAV).first()).toBeVisible()

      for (const target of SEQUENCE) {
        await openSwitcher(page)
        await clickLanguage(page, target)
        await page.waitForLoadState('networkidle')
        await verifyNo404(page)
        await expect(page.locator(NAV).first()).toBeVisible()
      }
    })
  }
})
