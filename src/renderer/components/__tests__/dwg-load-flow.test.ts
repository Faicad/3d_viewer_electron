import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  if (typeof globalThis.Worker === 'undefined') {
    class MockWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null
      onerror: ((e: { message: string }) => void) | null = null
      postMessage(_msg: unknown, _transfer?: unknown[]) { setTimeout(() => this.onmessage?.({ data: {} }), 0) }
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    }
    ;(globalThis as Record<string, unknown>).Worker = MockWorker
  }
  if (typeof globalThis.crypto?.randomUUID === 'undefined') {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => 'x' === c ? Math.random().toString(16).slice(2, 3) : (Math.random() * 0.25 + 0.75).toString(16).slice(2, 3)) },
      writable: false, configurable: true,
    })
  }
})

import { toggleFileInScene } from '../FileListPanel'

const mockDwgToSvg = vi.fn()
const mockAddLoadedFile = vi.fn()
const mockSetSelectedFileIndex = vi.fn()
const mockReset = vi.fn()
const mockToggleFile = vi.fn()
const mockReadFile = vi.fn()

vi.mock('@/lib/dwg-parser', () => ({
  dwgToSvg: (...args: unknown[]) => mockDwgToSvg(...args),
}))

vi.mock('@/config/file-formats', () => ({
  detectFormat: () => 'dwg',
  FORMAT_MAP: {},
  getDefaultUpAxis: () => 'y-up',
  isStepFile: () => false,
  isIgesFile: () => false,
  isBrepFile: () => false,
  isFcstdFile: () => false,
  MAX_STEP_FILE_SIZE: 104857600,
  EXT_COLORS: {},
}))

vi.mock('@/stores/model-store', () => ({
  useModelStore: {
    getState: () => ({
      loadedFiles: [],
      addLoadedFile: mockAddLoadedFile,
      setSelectedFileIndex: mockSetSelectedFileIndex,
      reset: mockReset,
      showProgress: vi.fn(),
      hideProgress: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/svg-workspace-store', () => ({
  useSvgWorkspaceStore: {
    getState: () => ({
      files: [],
      toggleFile: mockToggleFile,
      addFilesBatch: vi.fn(),
    }),
  },
  parseSvgLayers: () => [{ id: '0', name: 'Layer 1' }],
  parseSvgViewBox: () => ({ naturalWidth: 800, naturalHeight: 600 }),
}))

vi.mock('@/lib/thumbnail-cache/thumbnailGenerator', () => ({
  generateSvgThumbnail: vi.fn().mockResolvedValue(new Blob()),
}))

vi.mock('@/lib/thumbnail-cache/thumbnailCache', () => ({
  putThumbnail: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

describe('dwg load flow from thumbnail click', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = {
      readFile: mockReadFile,
    } as unknown as typeof window.electronAPI
  })

  it('calls dwgToSvg and adds file to store', async () => {
    const dwgBuffer = new ArrayBuffer(8)
    mockReadFile.mockResolvedValue({ success: true, data: dwgBuffer })
    mockDwgToSvg.mockResolvedValue('<svg viewBox="0 0 800 600"><rect width="100" height="100"/></svg>')

    await toggleFileInScene(
      { name: 'drawing.dwg', path: '/test/drawing.dwg', mtimeMs: 1000 },
      0,
    )

    expect(mockReadFile).toHaveBeenCalledWith('/test/drawing.dwg')

    expect(mockDwgToSvg).toHaveBeenCalledWith(dwgBuffer)

    expect(mockAddLoadedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'drawing.dwg',
        filePath: '/test/drawing.dwg',
        format: 'dwg',
        svgText: expect.stringContaining('<svg'),
      }),
    )
  })
})
