import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOn = vi.fn()
const mockCheckForUpdates = vi.fn()
const mockQuitAndInstall = vi.fn()
const mockSend = vi.fn()

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: mockOn,
    checkForUpdates: mockCheckForUpdates,
    quitAndInstall: mockQuitAndInstall,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    channel: 'latest',
  },
}))

vi.mock('electron', () => ({
  BrowserWindow: {},
}))

const mockGetWindow = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  mockGetWindow.mockReturnValue({
    webContents: { send: mockSend },
  })
})

describe('initUpdater', () => {
  it('sets autoDownload false and autoInstallOnAppQuit true', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    const { autoUpdater } = await import('electron-updater')
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
  })

  it('sets channel to cn for CN edition', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater('cn', mockGetWindow)
    const { autoUpdater } = await import('electron-updater')
    expect(autoUpdater.channel).toBe('cn')
  })

  it('registers all event listeners', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    expect(mockOn).toHaveBeenCalledWith('checking-for-update', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('update-available', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('update-not-available', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('download-progress', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('update-downloaded', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('forwards checking-for-update event to renderer', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    const handler = mockOn.mock.calls.find((c) => c[0] === 'checking-for-update')![1]
    handler()
    expect(mockSend).toHaveBeenCalledWith('update:checking')
  })

  it('forwards update-available event with version info', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    const handler = mockOn.mock.calls.find((c) => c[0] === 'update-available')![1]
    handler({ version: '2.0.0', releaseDate: '2026-07-05', releaseNotes: 'Bug fixes', releaseName: 'v2.0.0' })
    expect(mockSend).toHaveBeenCalledWith('update:available', {
      version: '2.0.0',
      releaseDate: '2026-07-05',
      releaseNotes: 'Bug fixes',
      releaseName: 'v2.0.0',
    })
  })

  it('forwards update-not-available event', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    const handler = mockOn.mock.calls.find((c) => c[0] === 'update-not-available')![1]
    handler({ version: '1.8.0' })
    expect(mockSend).toHaveBeenCalledWith('update:not-available', { version: '1.8.0' })
  })

  it('forwards download-progress event', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    const handler = mockOn.mock.calls.find((c) => c[0] === 'download-progress')![1]
    handler({ bytesPerSecond: 500000, percent: 42, total: 1000000, transferred: 420000 })
    expect(mockSend).toHaveBeenCalledWith('update:download-progress', {
      bytesPerSecond: 500000,
      percent: 42,
      total: 1000000,
      transferred: 420000,
    })
  })

  it('forwards update-downloaded event', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    const handler = mockOn.mock.calls.find((c) => c[0] === 'update-downloaded')![1]
    handler({ version: '2.0.0' })
    expect(mockSend).toHaveBeenCalledWith('update:downloaded', { version: '2.0.0' })
  })

  it('forwards error event', async () => {
    const { initUpdater } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    const handler = mockOn.mock.calls.find((c) => c[0] === 'error')![1]
    handler({ message: 'Network error' })
    expect(mockSend).toHaveBeenCalledWith('update:error', { message: 'Network error' })
  })
})

describe('checkForUpdates', () => {
  it('calls autoUpdater.checkForUpdates in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { initUpdater, checkForUpdates } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    checkForUpdates(false)
    expect(mockCheckForUpdates).toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('does not call checkForUpdates in dev mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { initUpdater, checkForUpdates } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    checkForUpdates(false)
    expect(mockCheckForUpdates).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('sends error in dev mode when manual is true', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { initUpdater, checkForUpdates } = await import('./updater')
    initUpdater(undefined, mockGetWindow)
    checkForUpdates(true)
    expect(mockSend).toHaveBeenCalledWith('update:error', {
      message: 'Auto-update is not available in development mode.',
    })
    vi.unstubAllEnvs()
  })
})

describe('quitAndInstall', () => {
  it('calls autoUpdater.quitAndInstall', async () => {
    const { quitAndInstall } = await import('./updater')
    quitAndInstall()
    expect(mockQuitAndInstall).toHaveBeenCalled()
  })
})

describe('setAutoDownload', () => {
  it('sets autoDownload on autoUpdater', async () => {
    const { setAutoDownload } = await import('./updater')
    setAutoDownload(true)
    const { autoUpdater } = await import('electron-updater')
    expect(autoUpdater.autoDownload).toBe(true)
  })
})
