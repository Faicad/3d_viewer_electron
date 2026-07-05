import { describe, it, expect } from 'vitest'
import { getAllHotkeys, getHotkeyByKey } from './hotkey-registry'

describe('hotkey-registry', () => {
  it('contains all expected global hotkeys', () => {
    const all = getAllHotkeys()
    const keys = all.map((h) => h.key)

    expect(keys).toContain('alt+p')
    expect(keys).toContain('alt+shift+p')
    expect(keys).toContain('alt+s')
    expect(keys).toContain('alt+z')
    expect(keys).toContain('alt+shift+z')
    expect(keys).toContain('alt+d')
    expect(keys).toContain('alt+c')
    expect(keys).toContain('alt+r')
    expect(keys).toContain('delete')
  })

  it('every entry has key, description, and category', () => {
    for (const entry of getAllHotkeys()) {
      expect(entry.key).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(['view', 'analysis', 'edit']).toContain(entry.category)
    }
  })

  it('has no duplicate keys', () => {
    const all = getAllHotkeys()
    const keys = all.map((h) => h.key)
    const uniqueKeys = new Set(keys)
    expect(keys.length).toBe(uniqueKeys.size)
  })

  it('getHotkeyByKey returns the correct entry', () => {
    const entry = getHotkeyByKey('alt+s')
    expect(entry).toBeDefined()
    expect(entry!.description).toBe('切换剖面面板')
    expect(entry!.category).toBe('analysis')
  })

  it('getHotkeyByKey returns undefined for unknown key', () => {
    expect(getHotkeyByKey('alt+unknown')).toBeUndefined()
  })
})
