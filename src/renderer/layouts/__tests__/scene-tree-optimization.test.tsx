import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SceneTreeNode } from '@/stores/model-store'

// ---- mutable store state for per-test overrides ----
const { mockStoreState } = vi.hoisted(() => {
  const state: Record<string, unknown> = {
    sceneTree: [] as SceneTreeNode[],
    glbUrl: null,
    modelBuffer: null,
    modelFormat: null,
    modelFilePath: null,
    loadedFiles: [],
    activeFileId: null,
    folderFiles: [],
    currentFolderPath: null,
    selectedFileIndex: -1,
    setIsConverting: vi.fn(),
    setModelBuffer: vi.fn(),
    setGLBUrl: vi.fn(),
    setFolderFiles: vi.fn(),
    setActiveUpAxis: vi.fn(),
    toggleNodeExpanded: vi.fn(),
    toggleNodeVisible: vi.fn(),
    setSelectedFileIndex: vi.fn(),
    setFileSortMode: vi.fn(),
    setSortOrder: vi.fn(),
    updateSceneTree: vi.fn(),
    setModelCenteringOffset: vi.fn(),
    setGlbPartInfos: vi.fn(),
    setLoadingPhase: vi.fn(),
    glbPartInfos: [],
    activeUpAxis: 'z',
    modelCenteringOffset: null,
    isConverting: false,
    sourceUnit: 'millimeter',
    fileGroup: 'mesh',
    setSourceUnit: vi.fn(),
    setFileGroup: vi.fn(),
    modelVersion: 0,
    setModelVersion: vi.fn(),
    __loadingPhase: 'idle',
    replaceModel: vi.fn(),
    reset: vi.fn(),
    setActiveFile: vi.fn(),
    removeLoadedFile: vi.fn(),
    addLoadedFile: vi.fn(),
    updateFileSceneTree: vi.fn(),
    updateFilePartInfos: vi.fn(),
    updateFileCenteringOffset: vi.fn(),
    updateFileLoadingPhase: vi.fn(),
    isFileLoaded: vi.fn(),
    setModelFilePath: vi.fn(),
  }
  return { mockStoreState: state }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

vi.mock('@/stores/model-store', () => ({
  useModelStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) =>
      selector ? selector(mockStoreState) : mockStoreState,
    { getState: () => mockStoreState },
  ),
}))

vi.mock('@/stores/ui-store', () => {
  const state = {
    leftPanelOpen: true,
    rightPanelOpen: false,
    modelInfoOpen: false,
    cameraMode: 'perspective',
    isFullscreen: false,
    headerVisible: true,
    bottomVisible: true,
    toggleLeftPanel: vi.fn(),
    toggleRightPanel: vi.fn(),
    toggleModelInfo: vi.fn(),
    setCameraMode: vi.fn(),
    setFullscreen: vi.fn(),
    setHeaderVisible: vi.fn(),
    setBottomVisible: vi.fn(),
  }
  const useUIStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state, setState: (partial: Partial<typeof state>) => Object.assign(state, partial) },
  )
  return { useUIStore }
})

vi.mock('@/stores/selection-store', () => {
  const state = {
    selectedReferenceIds: [] as string[],
    setSelectedReference: vi.fn(),
  }
  const useSelectionStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  )
  return { useSelectionStore }
})

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/lib/step-converter', () => ({
  stepToGlbCached: vi.fn(),
}))

vi.mock('@/components/FileListPanel', () => ({
  default: () => null,
}))

vi.mock('@/components/ModelInfoPanel', () => ({
  default: () => null,
}))

vi.mock('@/stores/engine-store', () => {
  const state = { modelGroup: null, setModelGroup: vi.fn() }
  const useEngineStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  )
  return { useEngineStore }
})

vi.mock('@/components/CacheManager', () => ({
  CacheManager: () => null,
}))

vi.mock('@/components/settings/SettingsDialog', () => ({
  SettingsDialog: () => null,
}))

vi.mock('@/pages/WorkspacePage', () => ({
  default: () => null,
}))

import DesktopLayout from '../DesktopLayout'

function renderDesktop() {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <DesktopLayout />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe('single-part file name display', () => {
  afterEach(() => {
    cleanup()
    mockStoreState.sceneTree = []
    mockStoreState.glbUrl = null
  })

  it('shows file name for single-part model instead of internal part name', () => {
    mockStoreState.glbUrl = 'box_boss.glb'
    mockStoreState.sceneTree = [
      {
        id: 'some-part',
        name: 'box_boss',
        visible: true,
        expanded: true,
        meshIndex: 0,
      },
    ]

    renderDesktop()

    expect(screen.getByText('box_boss')).toBeDefined()
  })

  it('shows file name for compressed single-part model', () => {
    mockStoreState.glbUrl = 'my_model.glb'
    mockStoreState.sceneTree = [
      {
        id: 'compressed-part',
        name: 'my_model',
        visible: true,
        expanded: true,
        meshIndex: 0,
      },
    ]

    renderDesktop()

    expect(screen.getByText('my_model')).toBeDefined()
  })

  it('shows internal part names when model has multiple parts', () => {
    mockStoreState.glbUrl = 'multi_part.glb'
    mockStoreState.sceneTree = [
      {
        id: 'root',
        name: 'Root',
        visible: true,
        expanded: true,
        children: [
          { id: 'p1', name: 'Part One', visible: true, expanded: true, meshIndex: 0 },
          { id: 'p2', name: 'Part Two', visible: true, expanded: true, meshIndex: 1 },
        ],
      },
    ]

    renderDesktop()

    expect(screen.getByText('Part One')).toBeDefined()
    expect(screen.getByText('Part Two')).toBeDefined()
    expect(screen.queryByText('multi_part')).toBeNull()
  })
})
