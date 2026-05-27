import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { useAnimationStore } from './animation-store'

function makeMockClip(name: string, duration: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [])
}

function reset() {
  useAnimationStore.setState({
    clips: [],
    currentIndex: -1,
    currentTime: 0,
    isPlaying: false,
    speed: 1,
    duration: 0,
    repeat: true,
    pingpong: false,
  })
}

describe('animation-store', () => {
  beforeEach(() => reset())

  describe('setClips', () => {
    it('populates clips and auto-selects first one', () => {
      const clips = [makeMockClip('Run', 2), makeMockClip('Jump', 1)]
      useAnimationStore.getState().setClips(clips)
      const s = useAnimationStore.getState()
      expect(s.clips).toHaveLength(2)
      expect(s.currentIndex).toBe(0)
      expect(s.duration).toBe(2)
      expect(s.isPlaying).toBe(true)
      expect(s.currentTime).toBe(0)
    })

    it('sets index=-1 and isPlaying=false for empty array', () => {
      useAnimationStore.getState().setClips([])
      const s = useAnimationStore.getState()
      expect(s.currentIndex).toBe(-1)
      expect(s.isPlaying).toBe(false)
      expect(s.duration).toBe(0)
    })
  })

  describe('selectAnimation', () => {
    it('switches clip and resets time', () => {
      useAnimationStore.getState().setClips([makeMockClip('A', 3), makeMockClip('B', 1)])
      useAnimationStore.getState().seek(1.5)
      useAnimationStore.getState().selectAnimation(1)
      const s = useAnimationStore.getState()
      expect(s.currentIndex).toBe(1)
      expect(s.duration).toBe(1)
      expect(s.currentTime).toBe(0)
      expect(s.isPlaying).toBe(true)
    })

    it('ignores out-of-range index', () => {
      useAnimationStore.getState().setClips([makeMockClip('X', 1)])
      useAnimationStore.getState().selectAnimation(5)
      expect(useAnimationStore.getState().currentIndex).toBe(0)
    })

    it('ignores negative index', () => {
      useAnimationStore.getState().setClips([makeMockClip('X', 1)])
      useAnimationStore.getState().selectAnimation(-1)
      expect(useAnimationStore.getState().currentIndex).toBe(0)
    })
  })

  describe('togglePlay', () => {
    it('toggles isPlaying', () => {
      useAnimationStore.getState().setClips([makeMockClip('Test', 2)])
      expect(useAnimationStore.getState().isPlaying).toBe(true)
      useAnimationStore.getState().togglePlay()
      expect(useAnimationStore.getState().isPlaying).toBe(false)
      useAnimationStore.getState().togglePlay()
      expect(useAnimationStore.getState().isPlaying).toBe(true)
    })

    it('setPlaying(false) then setPlaying(true) transitions correctly (play→pause→replay)', () => {
      useAnimationStore.getState().setClips([makeMockClip('Test', 2)])
      expect(useAnimationStore.getState().isPlaying).toBe(true)

      // Simulate animation ending
      useAnimationStore.getState().setPlaying(false)
      expect(useAnimationStore.getState().isPlaying).toBe(false)
      expect(useAnimationStore.getState().currentTime).toBe(0)

      // User clicks play again
      useAnimationStore.getState().setPlaying(true)
      expect(useAnimationStore.getState().isPlaying).toBe(true)
    })
  })

  describe('seek', () => {
    it('sets time and pauses playback', () => {
      useAnimationStore.getState().setClips([makeMockClip('Test', 5)])
      useAnimationStore.getState().seek(2.5)
      const s = useAnimationStore.getState()
      expect(s.currentTime).toBe(2.5)
      expect(s.isPlaying).toBe(false)
    })
  })

  describe('setSpeed', () => {
    it('changes speed', () => {
      useAnimationStore.getState().setSpeed(2)
      expect(useAnimationStore.getState().speed).toBe(2)
    })
  })

  describe('repeat and pingpong toggles', () => {
    it('repeat defaults to true, pingpong defaults to false', () => {
      expect(useAnimationStore.getState().repeat).toBe(true)
      expect(useAnimationStore.getState().pingpong).toBe(false)
    })

    it('toggles repeat', () => {
      useAnimationStore.getState().toggleRepeat()
      expect(useAnimationStore.getState().repeat).toBe(false)
      useAnimationStore.getState().toggleRepeat()
      expect(useAnimationStore.getState().repeat).toBe(true)
    })

    it('toggles pingpong', () => {
      useAnimationStore.getState().togglePingpong()
      expect(useAnimationStore.getState().pingpong).toBe(true)
      useAnimationStore.getState().togglePingpong()
      expect(useAnimationStore.getState().pingpong).toBe(false)
    })
  })

  describe('reset', () => {
    it('returns to initial state', () => {
      useAnimationStore.getState().setClips([makeMockClip('Test', 1)])
      useAnimationStore.getState().reset()
      const s = useAnimationStore.getState()
      expect(s.clips).toEqual([])
      expect(s.currentIndex).toBe(-1)
      expect(s.currentTime).toBe(0)
      expect(s.isPlaying).toBe(false)
      expect(s.speed).toBe(1)
      expect(s.duration).toBe(0)
      expect(s.repeat).toBe(true)
      expect(s.pingpong).toBe(false)
    })
  })
})
