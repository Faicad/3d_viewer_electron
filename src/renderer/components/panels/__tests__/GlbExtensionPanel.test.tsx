import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { GlbExtensionData } from '@/engine/gltfExtensions'

// Mock the store
const mockStore = {
  panelVisible: false,
  panelPosition: { x: 100, y: 200 },
  activeFileId: null as string | null,
  dataByFileId: {} as Record<string, GlbExtensionData>,
  openPanel: vi.fn(),
  closePanel: vi.fn(),
  setPanelPosition: vi.fn(),
  setData: vi.fn(),
  clearData: vi.fn(),
}

vi.mock('@/stores/glb-extension-store', () => ({
  useGlbExtensionStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Import after mocks
import GlbExtensionPanel from '../GlbExtensionPanel'

function makeMockData(overrides: Partial<GlbExtensionData> = {}): GlbExtensionData {
  return {
    used: ['KHR_materials_anisotropy'],
    required: [],
    extensions: [
      { name: 'KHR_materials_anisotropy', required: false, status: 'supported', category: 'material', description: '材质 — 各向异性' },
      { name: 'EXT_unknown_ext', required: false, status: 'unknown', category: 'unknown', description: '未知扩展' },
    ],
    materials: [
      { index: 0, name: 'metal', instanceCount: 3, textureSlotCount: 4, alphaMode: 'OPAQUE', doubleSided: false },
      { index: 1, name: 'glass', instanceCount: 1, textureSlotCount: 0, alphaMode: 'BLEND', doubleSided: true },
    ],
    textures: [
      { index: 0, name: 'tex0', uri: 'bufferView://0', mimeType: 'image/png', slots: ['material[0].baseColorTexture'], instanceCount: 1, compression: null, resolution: { width: 2048, height: 2048 }, sizeEstimate: 1048576 },
    ],
    animations: [
      { index: 0, name: 'idle', channels: 12, duration: 3.0 },
    ],
    ...overrides,
  }
}

function setStore(overrides: Partial<typeof mockStore>) {
  Object.assign(mockStore, overrides)
}

afterEach(() => {
  cleanup()
  // Reset store
  setStore({
    panelVisible: false,
    panelPosition: { x: 100, y: 200 },
    activeFileId: null,
    dataByFileId: {},
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    setPanelPosition: vi.fn(),
    setData: vi.fn(),
    clearData: vi.fn(),
  })
})

describe('GlbExtensionPanel', () => {
  it('renders nothing when panelVisible is false', () => {
    setStore({ panelVisible: false })
    const { container } = render(<GlbExtensionPanel />)
    expect(container.children).toHaveLength(0)
  })

  it('renders nothing when data is null (no active file)', () => {
    setStore({ panelVisible: true, activeFileId: null })
    const { container } = render(<GlbExtensionPanel />)
    expect(container.children).toHaveLength(0)
  })

  it('renders all 4 sections when data is present', () => {
    const data = makeMockData()
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)

    expect(screen.getByText('glbExtension.extensions')).toBeTruthy()
    expect(screen.getByText('glbExtension.materials')).toBeTruthy()
    expect(screen.getByText('glbExtension.textures')).toBeTruthy()
    expect(screen.getByText('glbExtension.animations')).toBeTruthy()
  })

  it('shows section item counts as badges', () => {
    const data = makeMockData()
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    // Badges show extension and material counts (both are "2")
    const badges = screen.getAllByText('2')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  it('shows "no extensions" when extensions array is empty', () => {
    const data = makeMockData({ extensions: [] })
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    expect(screen.getByText('glbExtension.noExtensions')).toBeTruthy()
  })

  it('shows "no textures" when textures array is empty', () => {
    const data = makeMockData({ textures: [] })
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    expect(screen.getByText('glbExtension.noTextures')).toBeTruthy()
  })

  it('shows "no animations" when animations array is empty', () => {
    const data = makeMockData({ animations: [] })
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    expect(screen.getByText('glbExtension.noAnimations')).toBeTruthy()
  })

  it('renders classification badges correctly', () => {
    const data = makeMockData()
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    expect(screen.getByText('glbExtension.supported')).toBeTruthy()
    expect(screen.getByText('glbExtension.unknown')).toBeTruthy()
  })

  it('renders material alphaMode badges', () => {
    const data = makeMockData()
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    expect(screen.getByText('OPAQUE')).toBeTruthy()
    expect(screen.getByText('BLEND')).toBeTruthy()
  })

  it('renders resolution as WxH', () => {
    const data = makeMockData()
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    expect(screen.getByText('2048x2048')).toBeTruthy()
  })

  it('renders animation duration', () => {
    const data = makeMockData()
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)
    expect(screen.getByText('3.0glbExtension.seconds')).toBeTruthy()
  })

  it('calls closePanel when X button clicked', () => {
    const data = makeMockData()
    const closePanel = vi.fn()
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data }, closePanel })
    render(<GlbExtensionPanel />)
    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)
    expect(closePanel).toHaveBeenCalledOnce()
  })

  it('material table rows have clickable style', () => {
    const data = makeMockData({
      materials: [
        { index: 0, name: 'metal', instanceCount: 3, textureSlotCount: 4, alphaMode: 'OPAQUE', doubleSided: false },
        { index: 1, name: 'glass', instanceCount: 1, textureSlotCount: 0, alphaMode: 'BLEND', doubleSided: true },
      ],
    })
    setStore({ panelVisible: true, activeFileId: 'file1', dataByFileId: { file1: data } })
    render(<GlbExtensionPanel />)

    // Material row should be present and have cursor-pointer
    const metalCell = screen.getByText('metal')
    const row = metalCell.closest('tr')
    expect(row).toBeTruthy()
    expect(row!.className).toContain('cursor-pointer')
  })
})
