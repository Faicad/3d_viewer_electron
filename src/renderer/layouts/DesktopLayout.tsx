import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFileLoader } from '@/hooks/useFileLoader'
import { useUIStore } from '@/stores/ui-store'
import { useModelStore, type SceneTreeNode } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { useSelectionStore } from '@/stores/selection-store'
import { cn } from '@/lib/utils'
import { hasViewData, type ViewMode } from '@/lib/bambu-3mf/viewTransforms'
import { stepToGlbCached } from '@/lib/step-converter'
import { detectFormat, FORMAT_MAP, getDefaultUpAxis, isStepFile } from '@/config/file-formats'
import { loadFormat, ModelEmptyError } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail, cacheKey } from '@/lib/thumbnail-cache/thumbnailCache'
import { useSvgWorkspaceStore } from '@/stores/svg-workspace-store'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, FolderOpen,
  Maximize, Minimize, Info, X,
  ChevronRight, ChevronDown, Eye, EyeOff,
  Cuboid, Grid3x3, Clock, Sun, Copy, ClipboardPaste, Palette, Play, FileJson, SwatchBook, Check, Box, Trash2, Download, Zap,
} from 'lucide-react'
import WorkspacePage from '@/pages/WorkspacePage'
import FileListPanel from '@/components/FileListPanel'
import ModelInfoPanel from '@/components/ModelInfoPanel'
import HistoryPanel from '@/components/HistoryPanel'
import EnvironmentPanel from '@/components/panels/EnvironmentPanel'
import MaterialEditor from '@/components/panels/MaterialEditor'
import GlbExtensionPanel from '@/components/panels/GlbExtensionPanel'
import SvgLayerTree from '@/components/panels/SvgLayerTree'
import { useGlbExtensionStore } from '@/stores/glb-extension-store'
import { useMaterialStore } from '@/stores/material-store'
import { ContextMenu as ContextMenuUI } from '@/components/ui/ContextMenu'
import type { ContextMenuItemDef } from '@/components/ui/ContextMenu'

import { hasExportableModel, isPureScad, exportSceneToGlb, exportFileToStl, exportFileToGlb, exportFileTo3mf, isFormatExportable } from '@/engine/exporters'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { CacheManager } from '@/components/CacheManager'
import { findFileIdForNode, collectFileIdsFromSelection } from '@/lib/scene-tree-utils'

/** Find the first part node (meshIndex !== undefined) in a scene tree recursively */
/** Find a node by id in the scene tree (recursive). */
function findNodeInTree(nodes: SceneTreeNode[], id: string): SceneTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNodeInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}

/** Build a human-readable title for the material editor. */
function materialEditorTitle(node: SceneTreeNode, sceneTree: SceneTreeNode[], loadedFiles: { id: string; fileName: string }[]): string {
  const isFileNode = node.id.startsWith('file:')
  if (isFileNode) return node.name

  const fileId = findFileIdForNode(sceneTree, node.id)
  const file = fileId ? loadedFiles.find(f => f.id === fileId) : null
  const fileName = file?.fileName ?? fileId ?? ''
  return `${node.name} / ${fileName}`
}

function SceneTreeItem({ node, depth, parentFileId, treePath, onPartContextMenu, onFileContextMenu, onNodeContextMenu }: {
  node: SceneTreeNode
  depth: number
  parentFileId?: string
  treePath?: string
  onPartContextMenu?: (e: React.MouseEvent, partId: string, fileId: string, nodePathStr?: string) => void
  onFileContextMenu?: (e: React.MouseEvent, fileId: string) => void
  onNodeContextMenu?: (e: React.MouseEvent, nodeId: string, fileId: string | undefined, nodePathStr: string) => void
}) {
  const hasChildren = node.children && node.children.length > 0
  const toggleExpanded = useModelStore((s) => s.toggleNodeExpanded)
  const toggleVisible = useModelStore((s) => s.toggleNodeVisible)
  const setActiveFile = useModelStore((s) => s.setActiveFile)
  const removeLoadedFile = useModelStore((s) => s.removeLoadedFile)
  const selectedReferenceIds = useSelectionStore((s) => s.selectedReferenceIds)
  const isSelected = selectedReferenceIds.includes(node.id)
  const isFileNode = node.id.startsWith('file:')
  const fileId = isFileNode ? node.id.slice(5) : parentFileId
  const isPartNode = node.meshIndex !== undefined && fileId != null
  const nodePathStr = treePath ? `${treePath} / ${node.name}` : node.name

  return (
    <>
      <div
        data-testid={isPartNode ? 'scene-tree-part' : isFileNode ? 'scene-tree-file' : 'scene-tree-group'}
        className={cn(
          'flex items-center gap-1 text-sm py-1 px-1 rounded hover:bg-accent cursor-pointer group whitespace-nowrap',
          isFileNode && 'font-semibold',
          !node.visible && 'opacity-40',
          isSelected && 'bg-accent ring-1 ring-primary',
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={(e) => {
          if (isFileNode && fileId) {
            setActiveFile(fileId)
            return
          }
          const { setSelectedReference } = useSelectionStore.getState()
          setSelectedReference(node.id, { shiftKey: e.shiftKey || e.ctrlKey || e.metaKey })
        }}
        onContextMenu={(e) => {
          if (isPartNode && onPartContextMenu && fileId) {
            e.preventDefault()
            onPartContextMenu(e, node.id, fileId, nodePathStr)
          } else if (isFileNode && onFileContextMenu && fileId) {
            e.preventDefault()
            onFileContextMenu(e, fileId)
          } else if (!isFileNode && !isPartNode && onNodeContextMenu) {
            e.preventDefault()
            onNodeContextMenu(e, node.id, fileId, nodePathStr)
          }
        }}
      >
        {/* Expand/collapse chevron */}
        <button
          className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            toggleExpanded(node.id)
          }}
          aria-label={node.expanded ? 'collapse' : 'expand'}
        >
          {hasChildren ? (
            node.expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="w-3" />
          )}
        </button>

        {/* Visibility toggle (eye) */}
        <button
          className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            toggleVisible(node.id)
          }}
          aria-label={node.visible ? 'hide' : 'show'}
        >
          {node.visible ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </button>

        <span className="flex-1 truncate">{node.name}</span>

        {/* Close button for file-level nodes */}
        {isFileNode && fileId && (
          <button
            className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              removeLoadedFile(fileId)
            }}
            aria-label="remove file"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Recursive children */}
      {hasChildren && node.expanded &&
        node.children!.map((child) => (
          <SceneTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            parentFileId={fileId ?? parentFileId}
            treePath={nodePathStr}
            onPartContextMenu={onPartContextMenu}
            onFileContextMenu={onFileContextMenu}
            onNodeContextMenu={onNodeContextMenu}
          />
        ))}
    </>
  )
}

const MIN_PANEL_PCT = 8
const MAX_PANEL_PCT = 40

function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className="shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
      style={{ width: 4 }}
      onMouseDown={onMouseDown}
    />
  )
}

export default function DesktopLayout() {
  const { projectId } = useParams<{ projectId?: string }>()
  const { t } = useTranslation()
  const ui = useUIStore()
  const showHeatbed = useEngineStore((s) => s.showHeatbed)
  const setShowHeatbed = useEngineStore((s) => s.setShowHeatbed)
  const activeUpAxis = useModelStore((s) => s.activeUpAxis)
  const sceneTree = useModelStore((s) => s.sceneTree)
  const hasModel = useModelStore((s) => s.modelBuffer !== null || s.loadedFiles.length > 0)
  const hasAnimations = useModelStore((s) => s.loadedFiles.some((f) => f.animations?.length))
  const hasExportable = useModelStore((s) => hasExportableModel(s.loadedFiles))
  const folderFilesLen = useModelStore((s) => s.folderFiles.length)
  const selectedFileIndex = useModelStore((s) => s.selectedFileIndex)
  const setActiveUpAxis = useModelStore((s) => s.setActiveUpAxis)

  const isSvgMode = useSvgWorkspaceStore((s) => s.files.length > 0)
  const activeTool = hasModel

  const [leftPanelPct, setLeftPanelPct] = useState(15)
  const [rightPanelPct, setRightPanelPct] = useState(15)
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; items: ContextMenuItemDef[];
  } | null>(null)

  const handlePartContextMenu = useCallback((e: React.MouseEvent, partId: string, fileId: string, nodePathStr?: string) => {
    const materialStore = useMaterialStore.getState()
    const modelStore = useModelStore.getState()

    // Select the right-clicked part so the scene-tree highlight and the
    // auto-switch editing-target effect stay consistent.
    useSelectionStore.getState().setSelectedReference(partId, { shiftKey: false })

    // In multi-file mode, partId (node.id) is scoped as "fileId:rawPartId".
    // Extract the unscoped partId for material store operations that construct
    // the override key via makeOverrideKey(fileId, rawPartId).
    const rawPartId = partId.startsWith(fileId + ':') ? partId.slice(fileId.length + 1) : partId
    const app = materialStore.getEffectiveAppearance(fileId, rawPartId)
    const partNode = findNodeInTree(modelStore.sceneTree, partId)
    const title = partNode
      ? materialEditorTitle(partNode, modelStore.sceneTree, modelStore.loadedFiles)
      : `${partId} / ${fileId}`
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Edit Material',
          icon: Palette,
          action: () => {
            const key = partId
            materialStore.openMaterialEditor(key, [key], title, false)
          },
        },
        {
          label: 'Copy Material',
          icon: Copy,
          action: () => {
            if (app) materialStore.copyMaterialToClipboard(app)
          },
          disabled: !app,
        },
        {
          label: 'Paste Material',
          icon: ClipboardPaste,
          action: () => {
            materialStore.pasteMaterialFromClipboard(fileId, rawPartId)
          },
          disabled: !materialStore.materialClipboard,
        },
        {
          label: 'Copy Node Path',
          icon: Copy,
          action: () => {
            navigator.clipboard.writeText(nodePathStr ?? partId)
          },
        },
        { type: 'separator' },
        {
          label: '从场景树中移除',
          icon: Trash2,
          danger: true,
          action: () => {
            useModelStore.getState().toggleNodeVisible(partId)
          },
        },
      ],
    })
  }, [])

  // ---- Export handlers ----

  const handleToolbarExport = useCallback(async () => {
    const files = useModelStore.getState().loadedFiles
    const scene = useEngineStore.getState().scene
    if (!scene) return

    try {
      if (isPureScad(files)) {
        const scadFile = files.find(f => f.format === 'scad')!
        await exportFileToStl(scene, scadFile)
      } else {
        await exportSceneToGlb(scene, undefined, undefined, files)
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Export failed')
    }
  }, [])

  const handleFileExportStl = useCallback(async (fileId: string) => {
    const file = useModelStore.getState().loadedFiles.find(f => f.id === fileId)
    const scene = useEngineStore.getState().scene
    if (!file || !scene) return
    try {
      await exportFileToStl(scene, file)
    } catch (err: any) {
      toast.error(err?.message ?? 'Export STL failed')
    }
  }, [])

  const handleFileExport3mf = useCallback(async (fileId: string) => {
    const file = useModelStore.getState().loadedFiles.find(f => f.id === fileId)
    const scene = useEngineStore.getState().scene
    if (!file || !scene) return
    try {
      await exportFileTo3mf(scene, file)
    } catch (err: any) {
      toast.error(err?.message ?? 'Export 3MF failed')
    }
  }, [])

  const handleFileExportGlb = useCallback(async (fileId: string) => {
    const file = useModelStore.getState().loadedFiles.find(f => f.id === fileId)
    const scene = useEngineStore.getState().scene
    if (!file || !scene) return
    try {
      await exportFileToGlb(scene, file)
    } catch (err: any) {
      toast.error(err?.message ?? 'Export GLB failed')
    }
  }, [])

  // File-level context menu — show format-specific items
  const handleFileContextMenu = useCallback((e: React.MouseEvent, fileId: string) => {
    const modelStore = useModelStore.getState()
    const engineStore = useEngineStore.getState()
    const file = modelStore.loadedFiles.find(f => f.id === fileId)
    const isGlb = file?.format === 'glb' || file?.format === 'gltf'
    const hasAnims = (file?.animations?.length ?? 0) > 0
    const isBambu3mf = file?.format === '3mf' && file?.bambuMetadata != null
    const currentView = engineStore.viewMode

    // Select the right-clicked file node
    useSelectionStore.getState().setSelectedReference(`file:${fileId}`, { shiftKey: false })

    e.preventDefault()
    e.stopPropagation()
    const items: ContextMenuItemDef[] = []
    if (isGlb) {
      items.push({
        label: t('glbExtension.menuTitle'),
        icon: FileJson,
        action: () => {
          useGlbExtensionStore.getState().openPanel(fileId)
        },
      })
      items.push({
        label: t('glbExtension.manageMaterials'),
        icon: SwatchBook,
        action: () => {
          useGlbExtensionStore.getState().openPanelWithScroll(fileId, 'materials')
        },
      })
    }
    if (hasAnims) {
      items.push({
        label: '播放动画',
        icon: Play,
        action: () => {
          modelStore.openAnimDialog(fileId)
        },
      })
    }
    if (isBambu3mf) {
      items.push({ type: 'separator' })
      const viewModes: { mode: ViewMode; label: string }[] = [
        { mode: 'print', label: 'Print View' },
        { mode: 'assembly', label: 'Assembly View' },
        { mode: 'import', label: 'Import View' },
      ]
      for (const vm of viewModes) {
        if (vm.mode === 'print' || hasViewData(vm.mode, file!.bambuMetadata!)) {
          items.push({
            label: vm.label,
            icon: currentView === vm.mode ? Check : undefined,
            action: () => {
              engineStore.setViewMode(vm.mode)
            },
            disabled: currentView === vm.mode,
          })
        }
      }
    }
    // Export — only for exportable formats
    if (file && isFormatExportable(file.format)) {
      items.push({ type: 'separator' })
      items.push({
        label: '导出 STL',
        icon: Download,
        action: () => { handleFileExportStl(fileId) },
      })
      items.push({
        label: '导出 3MF',
        icon: Download,
        action: () => { handleFileExport3mf(fileId) },
      })
      items.push({
        label: '导出 GLB',
        icon: Download,
        action: () => { handleFileExportGlb(fileId) },
      })
    }
    items.push({
      label: '打开所在文件夹',
      icon: FolderOpen,
      action: () => {
        if (file?.filePath) {
          window.electronAPI.showItemInFolder(file.filePath)
        }
      },
    })
    items.push({
      label: 'Copy File Path',
      icon: Copy,
      action: () => {
        if (file?.filePath) {
          navigator.clipboard.writeText(file.filePath)
        }
      },
    })
    items.push({ type: 'separator' })
    items.push({
      label: '从场景树中移除',
      icon: Trash2,
      action: () => {
        useModelStore.getState().removeLoadedFile(fileId)
      },
    })
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [t])

  // Group/node-level context menu
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string, _fileId: string | undefined, nodePathStr: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Select the right-clicked node
    useSelectionStore.getState().setSelectedReference(nodeId, { shiftKey: false })

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Copy Node Path',
          icon: Copy,
          action: () => {
            navigator.clipboard.writeText(nodePathStr)
          },
        },
        { type: 'separator' },
        {
          label: '从场景树中移除',
          icon: Trash2,
          action: () => {
            useModelStore.getState().toggleNodeVisible(nodeId)
          },
        },
      ],
    })
  }, [])

  // Open material editor from toolbar — selects first part if no selection, or default material if no files
  const handleOpenMaterialEditor = useCallback(() => {
    const materialStore = useMaterialStore.getState()
    const modelStore = useModelStore.getState()
    const selectionStore = useSelectionStore.getState()

    // Toggle: if editor is already open, close it
    if (materialStore.materialEditorVisible) {
      materialStore.closeMaterialEditor()
      return
    }

    // Case 1: No files loaded → edit default material
    if (modelStore.loadedFiles.length === 0) {
      materialStore.openDefaultMaterialEditor()
      return
    }

    // Case 2: Exactly one selection, and it's a mesh node → edit that mesh
    const selectedIds = selectionStore.selectedReferenceIds
    if (selectedIds.length === 1) {
      const selectedId = selectedIds[0]
      const selectedNode = findNodeInTree(modelStore.sceneTree, selectedId)
      if (selectedNode && selectedNode.meshIndex !== undefined) {
        const fileId = findFileIdForNode(modelStore.sceneTree, selectedId)
        if (fileId) {
          const key = selectedId
          const title = materialEditorTitle(selectedNode, modelStore.sceneTree, modelStore.loadedFiles)
          materialStore.openMaterialEditor(key, [key], title, false)
          return
        }
      }
    }

    // Case 3: Otherwise → show hint
    toast.info('请先选中一个对象')
  }, [])

  // ---- Auto-switch material editor when selecting a different mesh ----
  const selectedRefIds = useSelectionStore((s) => s.selectedReferenceIds)
  useEffect(() => {
    const matStore = useMaterialStore.getState()

    // Only auto-switch when editor is open and editing a single mesh
    // (not default material, not GLB material definition)
    if (!matStore.materialEditorVisible) return
    if (matStore.isEditingDefault) return
    if (matStore.isEditingMaterialDefinition) return

    // Only when exactly one node is selected
    if (selectedRefIds.length !== 1) return

    const newId = selectedRefIds[0]
    if (newId === matStore.editingOverrideKey) return

    // Must be a mesh node (not file, not group)
    const modelStore = useModelStore.getState()
    const node = findNodeInTree(modelStore.sceneTree, newId)
    if (!node || node.meshIndex === undefined) return

    const fileId = findFileIdForNode(modelStore.sceneTree, newId)
    if (!fileId) return

    const title = materialEditorTitle(node, modelStore.sceneTree, modelStore.loadedFiles)
    matStore.openMaterialEditor(newId, [newId], title, false)
  }, [selectedRefIds])

  // ---- Mutual exclusion: close material panel on model load / file switch ----
  const loadedFileCount = useModelStore((s) => s.loadedFiles.length)
  const prevLoadedFileCount = useRef(loadedFileCount)
  useEffect(() => {
    // Model loaded while default material editor is open → close it
    if (prevLoadedFileCount.current === 0 && loadedFileCount > 0) {
      const matStore = useMaterialStore.getState()
      if (matStore.isEditingDefault && matStore.materialEditorVisible) {
        matStore.closeMaterialEditor()
      }
    }
    prevLoadedFileCount.current = loadedFileCount
  }, [loadedFileCount])

  const activeFileId = useModelStore((s) => s.activeFileId)
  useEffect(() => {
    // File switched → close any open material panel
    const matStore = useMaterialStore.getState()
    if (matStore.materialEditorVisible) {
      matStore.closeMaterialEditor()
    }
  }, [activeFileId])

  useEffect(() => {
    if (!resizing) return
    const handleMouseMove = (e: MouseEvent) => {
      const totalWidth = window.innerWidth
      const pct = (e.clientX / totalWidth) * 100
      if (resizing === 'left') {
        setLeftPanelPct(Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, pct)))
      } else {
        setRightPanelPct(Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, 100 - pct)))
      }
    }
    const handleMouseUp = () => setResizing(null)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing])

  // Reactive compact mode: auto-open/close left panel at 1024px breakpoint
  const isCompactViewport = useMediaQuery('(max-width: 1023px)')

  useEffect(() => {
    useUIStore.setState({ leftPanelOpen: !isCompactViewport })
  }, [isCompactViewport])

  const isFullscreen = useUIStore((s) => s.isFullscreen)
  const setHeaderVisible = useUIStore((s) => s.setHeaderVisible)
  const setBottomVisible = useUIStore((s) => s.setBottomVisible)
  const headerVisible = useUIStore((s) => s.headerVisible)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFullscreenChanged((v) => {
      useUIStore.getState().setFullscreen(v)
    })
    return unsubscribe
  }, [])

  const handleToggleFullscreen = useCallback(async () => {
    const result = await window.electronAPI.toggleFullscreen()
    useUIStore.getState().setFullscreen(result)
  }, [])

  // Fullscreen auto-hide panels + toolbar
  const prevPanelStateRef = useRef({ left: true, right: true })
  useEffect(() => {
    if (isFullscreen) {
      const { leftPanelOpen, rightPanelOpen } = useUIStore.getState()
      prevPanelStateRef.current = { left: leftPanelOpen, right: rightPanelOpen }
      if (leftPanelOpen) useUIStore.getState().toggleLeftPanel()
      if (rightPanelOpen) useUIStore.getState().toggleRightPanel()
      setHeaderVisible(false)
      setBottomVisible(false)
    } else {
      setHeaderVisible(true)
      setBottomVisible(true)
      const { left: prevLeft, right: prevRight } = prevPanelStateRef.current
      const { leftPanelOpen, rightPanelOpen } = useUIStore.getState()
      if (prevLeft && !leftPanelOpen) useUIStore.getState().toggleLeftPanel()
      if (prevRight && !rightPanelOpen) useUIStore.getState().toggleRightPanel()
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      setHeaderVisible(e.clientY <= 40)
      setBottomVisible(e.clientY >= window.innerHeight - 80)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [isFullscreen, setHeaderVisible, setBottomVisible])

  // Keyboard navigation for file list
  useEffect(() => {
    if (!ui.rightPanelOpen || folderFilesLen === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const { folderFiles, selectedFileIndex, setSelectedFileIndex } = useModelStore.getState()
      if (folderFiles.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = selectedFileIndex === -1 ? 0 : (selectedFileIndex + 1) % folderFiles.length
        setSelectedFileIndex(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = selectedFileIndex <= 0 ? folderFiles.length - 1 : selectedFileIndex - 1
        setSelectedFileIndex(prev)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const idx = selectedFileIndex === -1 ? 0 : selectedFileIndex
        const file = folderFiles[idx]
        if (file) {
          const store = useModelStore.getState()
          // If already loaded, just switch
          const existing = store.loadedFiles.find(f => f.filePath === file.path)
          if (existing) {
            store.setActiveFile(existing.id)
            return
          }
          // Otherwise load it
          window.electronAPI.readFile(file.path).then(async (fileResult) => {
            if (fileResult.success && fileResult.data) {
              let buffer = fileResult.data
              const isStep = isStepFile(file.name)
              let format = detectFormat(file.name)
              if (isStep) {
                try {
                  useModelStore.getState().showProgress('Converting STEP geometry...')
                  const { buffer: glbBuffer } = await stepToGlbCached(buffer,
                    { filePath: file.path, mtimeMs: file.mtimeMs },
                    { wasmPath: '/wasm/occt-import-js.wasm' },
                  )
                  buffer = glbBuffer
                  format = 'glb'
                } catch (e) {
                  console.error('[DesktopLayout] STEP conversion failed:', e)
                  toast.error('STEP conversion failed: ' + (e instanceof Error ? e.message : String(e)))
                  useModelStore.getState().hideProgress()
                  return
                }
              }
              if (!format) return
              try {
                if (!isStep) useModelStore.getState().showProgress(`Loading ${file.name}...`)
                const loadResult = await loadFormat(buffer, format, file.path)
                const fileId = crypto.randomUUID()
                setCachedResult(fileId, loadResult)
                const upAxis = getDefaultUpAxis(format, buffer, file.name)
                generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
                  .then(blob => {
                    if (blob) putThumbnail(cacheKey(file.path, file.mtimeMs), blob)
                  })
                useModelStore.getState().addLoadedFile({
                  id: fileId,
                  fileName: file.name,
                  filePath: file.path,
                  mtimeMs: file.mtimeMs,
                  buffer,
                  format,
                  sceneTree: [],
                  glbPartInfos: [],
                  modelCenteringOffset: null,
                  sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
                  fileGroup: FORMAT_MAP[format].group,
                  loadingPhase: 'loading',
                })
                useModelStore.getState().hideProgress()
              } catch (e) {
                useModelStore.getState().hideProgress()
                if (e instanceof ModelEmptyError) {
                  toast.error(t('error.modelEmpty', { fileName: e.fileName }))
                } else {
                  console.error('[DesktopLayout] keyboard load error:', e)
                  const msg = e instanceof Error ? e.message : String(e)
                  toast.error(msg || `Load failed: ${file.name}`)
                }
              }
            }
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ui.rightPanelOpen, folderFilesLen, selectedFileIndex])

  // Delete key — remove selected model(s) from scene and canvas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: don't delete when user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      if (e.key !== 'Delete') return
      e.preventDefault()

      // --- SVG mode ---
      if (isSvgMode) {
        const svgStore = useSvgWorkspaceStore.getState()
        if (svgStore.selectedFileId) {
          svgStore.removeFile(svgStore.selectedFileId)
        }
        return
      }

      // --- 3D mode ---
      const { selectedReferenceIds } = useSelectionStore.getState()
      if (selectedReferenceIds.length === 0) return

      const { sceneTree } = useModelStore.getState()
      const fileIds = collectFileIdsFromSelection(sceneTree, selectedReferenceIds)
      for (const fileId of fileIds) {
        useModelStore.getState().removeLoadedFile(fileId)
      }
      useSelectionStore.getState().clearSelection()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSvgMode])

  const { loadFilesFromDialog } = useFileLoader()

  const handleOpenFile = useCallback(async () => {
    await loadFilesFromDialog()
  }, [loadFilesFromDialog])

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* TopBar */}
      <header
        className={cn(
          "flex items-center gap-2 overflow-x-auto transition-all duration-500 ease-in-out border-b",
          isFullscreen && !headerVisible && "overflow-hidden border-b-0",
        )}
        style={{
          height: isFullscreen && !headerVisible ? 0 : 40,
          opacity: isFullscreen && !headerVisible ? 0 : 1,
          paddingLeft: isFullscreen && !headerVisible ? 0 : 8,
          paddingRight: isFullscreen && !headerVisible ? 0 : 8,
          paddingTop: isFullscreen && !headerVisible ? 0 : undefined,
          paddingBottom: isFullscreen && !headerVisible ? 0 : undefined,
          flexShrink: isFullscreen && !headerVisible ? 1 : 0,
        }}
      >
        <a
          href="https://www.faicad.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.1 shrink-0 px-2 hover:opacity-80 transition-opacity"
        >
          <img src="/logo.svg" alt="Faicad" className="h-8 w-8 object-contain" />
          <span className="inline-flex items-baseline gap-0.5">
            <span className="font-semibold text-base">Fai</span>
            <span className="font-semibold text-sm">CAD</span>
          </span>
        </a>
        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* Open File */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleOpenFile} aria-label={t('toolbar.openFile')}>
              <FolderOpen className="toolbar-icon h-4 w-4 text-sky-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.openFile')}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* Y↑ / Z↑ */}
        {!isSvgMode && (<>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeUpAxis === 'y' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setActiveUpAxis('y')}
              aria-label={t('toolbar.yUp')}
            >
              <span className="text-xs font-bold leading-none">Y↑</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.yUp')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeUpAxis === 'z' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setActiveUpAxis('z')}
              aria-label={t('toolbar.zUp')}
            >
              <span className="text-xs font-bold leading-none">Z↑</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.zUp')}</TooltipContent>
        </Tooltip>
        </>)}

        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* Perspective / Orthographic */}
        {!isSvgMode && (<>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.cameraMode === 'perspective' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => ui.setCameraMode('perspective')}
              aria-label={t('toolbar.perspective')}
            >
              <Cuboid className="toolbar-icon h-4 w-4 text-violet-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.perspective')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.cameraMode === 'orthographic' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => ui.setCameraMode('orthographic')}
              aria-label={t('toolbar.orthographic')}
            >
              <Box className="toolbar-icon h-4 w-4 text-emerald-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.orthographic')}</TooltipContent>
        </Tooltip>
        </>)}

        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* Material Editor / Render Settings / Heatbed */}
        {!isSvgMode && (<>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleOpenMaterialEditor}
              aria-label={t('toolbar.materialEditor')}
            >
              <Palette className="toolbar-icon h-4 w-4 text-pink-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.materialEditor')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.environmentPanelOpen ? 'secondary' : 'ghost'}
              size="icon"
              onClick={ui.toggleEnvironmentPanel}
              aria-label={t('toolbar.environment')}
            >
              <Sun className="toolbar-icon h-4 w-4 text-amber-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.environment')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showHeatbed ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setShowHeatbed(!showHeatbed)}
              aria-label={t('toolbar.heatbed')}
              data-testid="toolbar-heatbed"
            >
              <Grid3x3 className="toolbar-icon h-4 w-4 text-orange-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.heatbed')}</TooltipContent>
        </Tooltip>
        </>)}

        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* History / Model Info / Animation */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.historyPanelOpen ? 'secondary' : 'ghost'}
              size="icon"
              onClick={ui.toggleHistoryPanel}
              aria-label={t('toolbar.history')}
            >
              <Clock className="toolbar-icon h-4 w-4 text-cyan-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.history')}</TooltipContent>
        </Tooltip>
        {!isSvgMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.modelInfoOpen ? 'secondary' : 'ghost'}
              size="icon"
              disabled={!activeTool}
              onClick={ui.toggleModelInfo}
              aria-label={t('toolbar.modelInfo')}
              data-testid="toolbar-model-info"
            >
              <Info className="toolbar-icon h-4 w-4 text-blue-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className={cn(!activeTool && "bg-muted text-muted-foreground")}>{t('toolbar.modelInfo')}</TooltipContent>
        </Tooltip>
        )}

        <Separator orientation="vertical" className="h-5 shrink-0" />

        {!isSvgMode && hasAnimations && (<>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const file = useModelStore.getState().loadedFiles.find((f) => f.animations?.length)
                if (file) useModelStore.getState().openAnimDialog(file.id)
              }}
              aria-label={t('toolbar.animationPlayer')}
              data-testid="toolbar-animation-player"
            >
              <Play className="toolbar-icon h-4 w-4 text-green-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.animationPlayer')}</TooltipContent>
        </Tooltip>
        </>)}
        {!isSvgMode && (<>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!activeTool}
              onClick={() => {
                window.__demoGSAPExplode?.()
              }}
              aria-label={t('toolbar.explosion')}
              data-testid="toolbar-explosion"
            >
              <Zap className="toolbar-icon h-4 w-4 text-red-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className={cn(!activeTool && "bg-muted text-muted-foreground")}>{t('toolbar.explosion')}</TooltipContent>
        </Tooltip>
        </>)}

        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* Export */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!hasExportable}
              onClick={handleToolbarExport}
              aria-label={t('toolbar.export')}
              data-testid="toolbar-export"
            >
              <Download className="toolbar-icon h-4 w-4 text-green-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className={cn(!hasExportable && "bg-muted text-muted-foreground")}>{hasExportable ? t('toolbar.export') : t('toolbar.exportDisabled')}</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Fullscreen / Left / Right Panel */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleToggleFullscreen} aria-label={t('toolbar.fullscreen')}>
              {isFullscreen ? <Minimize className="toolbar-icon h-4 w-4 text-fuchsia-500" /> : <Maximize className="toolbar-icon h-4 w-4 text-fuchsia-500" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.fullscreen')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={ui.toggleLeftPanel} aria-label={t('toolbar.leftPanel')}>
              {ui.leftPanelOpen ? <PanelLeftClose className="toolbar-icon h-4 w-4 text-indigo-500" /> : <PanelLeftOpen className="toolbar-icon h-4 w-4 text-indigo-500" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.leftPanel')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={ui.toggleRightPanel} aria-label={t('toolbar.rightPanel')}>
              {ui.rightPanelOpen ? <PanelRightClose className="toolbar-icon h-4 w-4 text-indigo-500" /> : <PanelRightOpen className="toolbar-icon h-4 w-4 text-indigo-500" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.rightPanel')}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* Cache / Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <CacheManager />
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.cache')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <SettingsDialog />
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.settings')}</TooltipContent>
        </Tooltip>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden" style={resizing ? { userSelect: 'none' } : undefined}>
        {/* Left Sidebar */}
        {ui.leftPanelOpen && (
          <>
            <aside data-testid="left-panel" style={{ width: `${leftPanelPct}%` } as React.CSSProperties} className="flex flex-col shrink-0">
              {isSvgMode ? (
                <SvgLayerTree />
              ) : (
                <>
                  <div className="p-2 text-xs font-semibold text-muted-foreground">{t('sceneTree.title')}</div>
                  <ScrollArea className="flex-1">
                    {sceneTree.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-4">{t('app.emptySceneTree')}</p>
                    ) : (
                      <div className="p-2 min-w-max">
                        {sceneTree.map((node) => (
                          <SceneTreeItem key={node.id} node={node} depth={0} onPartContextMenu={handlePartContextMenu} onFileContextMenu={handleFileContextMenu} onNodeContextMenu={handleNodeContextMenu} />
                        ))}
                      </div>
                    )}
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </>
              )}
            </aside>
            <ResizeHandle onMouseDown={() => setResizing('left')} />
          </>
        )}

        {/* Center: Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          <WorkspacePage projectId={projectId} />
        </div>

        {/* Right Panel */}
        {(ui.rightPanelOpen || ui.historyPanelOpen) && (
          <>
            <ResizeHandle onMouseDown={() => setResizing('right')} />
            <aside style={{ width: `${rightPanelPct}%` } as React.CSSProperties} className="flex flex-col shrink-0">
              {ui.historyPanelOpen ? (
                <HistoryPanel onClose={() => useUIStore.getState().toggleHistoryPanel()} />
              ) : (
                <FileListPanel />
              )}
            </aside>
          </>
        )}
      </div>

      {/* Model Info Panel (floating) */}
      {!isSvgMode && <ModelInfoPanel />}

      {/* Environment Panel (floating) */}
      {!isSvgMode && <EnvironmentPanel />}

      {/* GLB Extension Panel (floating) */}
      {!isSvgMode && <GlbExtensionPanel />}

      {/* Material Editor (floating) — must be after GlbExtensionPanel to render on top */}
      {!isSvgMode && <MaterialEditor />}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenuUI
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}