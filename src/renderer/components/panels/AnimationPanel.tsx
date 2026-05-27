import { Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAnimationStore, type LoopMode } from '@/stores/animation-store'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]

export default function AnimationPanel() {
  const clips = useAnimationStore((s) => s.clips)
  const currentIndex = useAnimationStore((s) => s.currentIndex)
  const currentTime = useAnimationStore((s) => s.currentTime)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const speed = useAnimationStore((s) => s.speed)
  const duration = useAnimationStore((s) => s.duration)
  const loopMode = useAnimationStore((s) => s.loopMode)

  const selectAnimation = useAnimationStore((s) => s.selectAnimation)
  const togglePlay = useAnimationStore((s) => s.togglePlay)
  const setSpeed = useAnimationStore((s) => s.setSpeed)
  const seek = useAnimationStore((s) => s.seek)
  const setLoopMode = useAnimationStore((s) => s.setLoopMode)

  const hasAnimations = clips.length > 0

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (!hasAnimations) return null

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50
                    flex items-center gap-3 px-4 py-2
                    bg-background/85 backdrop-blur border rounded-lg shadow-lg">
      {/* Animation dropdown */}
      <select
        value={currentIndex}
        onChange={(e) => selectAnimation(Number(e.target.value))}
        className="h-7 text-xs bg-transparent border rounded px-2 max-w-[160px]"
      >
        {clips.map((clip, i) => (
          <option key={i} value={i}>
            {clip.name || `Animation ${i + 1}`} ({clip.duration.toFixed(1)}s)
          </option>
        ))}
      </select>

      {/* Progress bar */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground w-9 tabular-nums text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-24 h-1 accent-primary"
        />
        <span className="text-xs text-muted-foreground w-9 tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      {/* Play/Pause */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={togglePlay}>
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>

      {/* Speed selector */}
      <div className="flex gap-0.5">
        {SPEEDS.map((s) => (
          <Button
            key={s}
            variant={speed === s ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => setSpeed(s)}
          >
            {s}x
          </Button>
        ))}
      </div>

      {/* Loop mode */}
      <div className="flex gap-0.5">
        {([
          ['repeat', '⟳'],
          ['once', '→|'],
          ['pingpong', '⇄'],
        ] as [LoopMode, string][]).map(([mode, icon]) => (
          <Button
            key={mode}
            variant={loopMode === mode ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => setLoopMode(mode)}
          >
            {icon}
          </Button>
        ))}
      </div>
    </div>
  )
}
