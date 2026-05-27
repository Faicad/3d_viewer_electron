import { Play, Pause, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAnimationStore } from '@/stores/animation-store'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]

export default function ControlBar() {
  const clips = useAnimationStore((s) => s.clips)
  const currentIndex = useAnimationStore((s) => s.currentIndex)
  const currentTime = useAnimationStore((s) => s.currentTime)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const speed = useAnimationStore((s) => s.speed)
  const duration = useAnimationStore((s) => s.duration)
  const repeat = useAnimationStore((s) => s.repeat)
  const pingpong = useAnimationStore((s) => s.pingpong)

  const selectAnimation = useAnimationStore((s) => s.selectAnimation)
  const togglePlay = useAnimationStore((s) => s.togglePlay)
  const setSpeed = useAnimationStore((s) => s.setSpeed)
  const seek = useAnimationStore((s) => s.seek)
  const toggleRepeat = useAnimationStore((s) => s.toggleRepeat)
  const togglePingpong = useAnimationStore((s) => s.togglePingpong)

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t">
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

      <div className="flex items-center gap-1.5 flex-1">
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
          className="flex-1 h-1 accent-primary"
        />
        <span className="text-xs text-muted-foreground w-9 tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={togglePlay}>
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>

      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="h-7 text-xs bg-transparent border rounded px-1"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>{s}x</option>
        ))}
      </select>

      {/* Repeat toggle — off = play once */}
      <Button
        variant={repeat ? 'default' : 'ghost'}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={toggleRepeat}
        title={repeat ? '循环播放中' : '单次播放'}
      >
        ⟳
      </Button>

      {/* Pingpong toggle — forward + backward; combine with repeat for infinite pingpong */}
      <Button
        variant={pingpong ? 'default' : 'ghost'}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={togglePingpong}
        title={pingpong ? '往复播放中' : '往复播放'}
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
