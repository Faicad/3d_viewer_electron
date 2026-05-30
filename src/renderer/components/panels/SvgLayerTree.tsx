import { useSvgWorkspaceStore } from '@/stores/svg-workspace-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Eye, EyeOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SvgLayerTree() {
  const files = useSvgWorkspaceStore((s) => s.files)
  const selectedFileId = useSvgWorkspaceStore((s) => s.selectedFileId)
  const selectFile = useSvgWorkspaceStore((s) => s.selectFile)
  const toggleLayer = useSvgWorkspaceStore((s) => s.toggleLayer)
  const toggleFileVisible = useSvgWorkspaceStore((s) => s.toggleFileVisible)
  const removeFile = useSvgWorkspaceStore((s) => s.removeFile)

  if (files.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No SVG files open
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b shrink-0">
        SVG Layers
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 min-w-max">
          {files.map((file) => {
            const isSelected = file.fileId === selectedFileId
            return (
              <div key={file.fileId}>
                {/* File node */}
                <div
                  className={cn(
                    'flex items-center gap-1 text-sm py-1 px-1 rounded hover:bg-accent cursor-pointer group whitespace-nowrap',
                    isSelected && 'bg-accent ring-1 ring-primary',
                    !file.visible && 'opacity-40',
                  )}
                  onClick={() => selectFile(file.fileId)}
                >
                  {/* File visibility toggle */}
                  <button
                    className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-muted"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFileVisible(file.fileId)
                    }}
                    aria-label={file.visible ? 'hide file' : 'show file'}
                  >
                    {file.visible ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                  </button>
                  <span className="font-semibold flex-1 truncate">{file.fileName}</span>
                  <button
                    className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(file.fileId)
                    }}
                    aria-label="remove file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {/* Layer children */}
                {file.layers.map((layer) => (
                  <div
                    key={layer.id}
                    className="flex items-center gap-1 text-sm py-1 px-1 rounded hover:bg-accent cursor-pointer whitespace-nowrap"
                    style={{ paddingLeft: 28 }}
                    onClick={() => toggleLayer(file.fileId, layer.id)}
                  >
                    <span className="h-4 w-4 shrink-0 flex items-center justify-center">
                      {layer.visible ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3 opacity-40" />
                      )}
                    </span>
                    <span className={cn('flex-1 truncate', !layer.visible && 'opacity-40')}>
                      {layer.name}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
