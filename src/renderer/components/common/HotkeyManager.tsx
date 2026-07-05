import { toast } from 'sonner'
import { useHotkey } from '@/hooks/useHotkey'
import { useEngineStore } from '@/stores/engine-store'
import { tryToggleCrossSection } from '@/stores/cross-section-store'
import { tryToggleZebra } from '@/stores/zebra-store'
import { tryToggleDraftAnalysis } from '@/stores/draft-analysis-store'
import { tryToggleSurfaceAnalysis } from '@/stores/surface-analysis-store'
import { tryToggleCurvatureComb } from '@/stores/curvature-comb-store'
import { useModelStore } from '@/stores/model-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useSvgWorkspaceStore } from '@/stores/svg-workspace-store'
import { collectFileIdsFromSelection } from '@/lib/scene-tree-utils'

export default function HotkeyManager() {
  useHotkey('alt+p', () => {
    const s = useEngineStore.getState()
    const next = !s.postProcessingEnabled
    s.setPostProcessingEnabled(next)
    toast.info(next ? '后处理已开启' : '后处理已关闭')
  })

  useHotkey('alt+shift+p', () => {
    const s = useEngineStore.getState()
    const next = !s.studioMode
    s.setStudioMode(next)
    toast.info(next ? 'Studio模式' : 'CAD模式')
  })

  useHotkey('alt+s', () => {
    tryToggleCrossSection()
  })

  useHotkey('alt+z', () => {
    tryToggleZebra()
  })

  useHotkey('alt+shift+z', () => {
    tryToggleSurfaceAnalysis()
  })

  useHotkey('alt+d', () => {
    tryToggleDraftAnalysis()
  })

  useHotkey('alt+c', () => {
    tryToggleCurvatureComb()
  })

  useHotkey('alt+r', () => {
    const isRotating = (window as any).__viewerRotating?.() ?? false
    if (isRotating) {
      window.dispatchEvent(new CustomEvent('stopRotate'))
      toast.info('旋转已停止')
    } else {
      window.dispatchEvent(new CustomEvent('startRotate'))
      toast.info('旋转已开始')
    }
  })

  useHotkey('delete', () => {
    const svgFiles = useSvgWorkspaceStore.getState().files
    if (svgFiles.length > 0) {
      const svgStore = useSvgWorkspaceStore.getState()
      if (svgStore.selectedFileId) {
        svgStore.removeFile(svgStore.selectedFileId)
      }
      return
    }

    const { selectedReferenceIds } = useSelectionStore.getState()
    if (selectedReferenceIds.length === 0) return

    const { sceneTree } = useModelStore.getState()
    const fileIds = collectFileIdsFromSelection(sceneTree, selectedReferenceIds)
    for (const fileId of fileIds) {
      useModelStore.getState().removeLoadedFile(fileId)
    }
    useSelectionStore.getState().clearSelection()
  })

  return null
}
