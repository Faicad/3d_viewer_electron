import { Loader2 } from 'lucide-react'
import { useModelStore } from '@/stores/model-store'

export function LoadingOverlay() {
  const loadingState = useModelStore(s => s.loadingState)

  if (!loadingState.isVisible) return null

  const isDeterminate = loadingState.percentage >= 0

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30">
      <div
        data-testid="loading-overlay"
        className="relative flex flex-col items-center gap-4 p-12
                   border-2 border-dashed border-muted-foreground/30
                   rounded-xl bg-background/70 backdrop-blur-sm
                   text-muted-foreground"
      >
        {/* Spinner — same size as drop overlay's Upload icon */}
        <Loader2 className="h-12 w-12 animate-spin text-primary" />

        {/* Phase label — same size as drop overlay's title */}
        <p className="text-lg font-medium text-foreground">
          {loadingState.message}
        </p>

        {/* Progress bar area — always present to match drop card footprint */}
        {isDeterminate ? (
          <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, loadingState.percentage))}%`,
              }}
            />
          </div>
        ) : (
          <div className="w-48 h-1.5" />
        )}
      </div>
    </div>
  )
}
