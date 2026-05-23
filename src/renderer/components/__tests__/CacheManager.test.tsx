import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

vi.mock('@/lib/step-converter/stepCache', () => ({
  clearStepCache: vi.fn().mockResolvedValue(undefined),
  memCache: new Map(),
}))

vi.mock('@/lib/thumbnail-cache/thumbnailCache', () => ({
  clearThumbnailCache: vi.fn().mockResolvedValue(undefined),
  memCache: new Map(),
}))

vi.mock('@/components/settings/useThemeColors', () => ({
  useThemeColors: () => ({
    textInactive: '#666',
    textDisabled: '#999',
    border: '#ccc',
    destructive: '#ff4444',
  }),
}))

import { CacheManager } from '../CacheManager'

describe('CacheManager', () => {
  afterEach(() => cleanup())

  it('opens the cache management dialog when the trigger button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <CacheManager />
      </TooltipProvider>,
    )

    const trigger = screen.getByRole('button')
    expect(trigger).toBeDefined()

    const titleBefore = screen.queryByText('cache.title')
    expect(titleBefore).toBeNull()

    await user.click(trigger)

    const dialogTitle = await screen.findByText('cache.title')
    expect(dialogTitle).toBeDefined()
  })
})
