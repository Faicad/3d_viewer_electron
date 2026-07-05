import { useEffect } from 'react'

type ModifierKey = 'alt' | 'shift' | 'ctrl' | 'meta'

interface ParsedKeyDef {
  modifiers: Set<ModifierKey>
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}

function parseKeyDef(keyDef: string): ParsedKeyDef {
  const parts = keyDef.split('+').map((s) => s.trim().toLowerCase())
  const modifiers = new Set<ModifierKey>()
  for (const part of parts.slice(0, -1)) {
    if (part === 'alt' || part === 'shift' || part === 'ctrl' || part === 'meta') {
      modifiers.add(part)
    }
  }
  const rawKey = parts[parts.length - 1] || ''
  return {
    modifiers,
    key: rawKey,
    shiftKey: modifiers.has('shift'),
    metaKey: modifiers.has('meta'),
    ctrlKey: modifiers.has('ctrl'),
    altKey: modifiers.has('alt'),
  }
}

function matchesEvent(parsed: ParsedKeyDef, e: KeyboardEvent): boolean {
  if (e.altKey !== parsed.altKey) return false
  if (e.shiftKey !== parsed.shiftKey) return false
  if (e.metaKey !== parsed.metaKey) return false
  if (e.ctrlKey !== parsed.ctrlKey) return false
  if (e.key.toLowerCase() !== parsed.key) return false
  return true
}

function isInputTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.contentEditable === 'true'
}

export function useHotkey(
  keyDef: string,
  handler: () => void,
  options?: { enabled?: boolean },
) {
  useEffect(() => {
    if (options?.enabled === false) return

    const parsed = parseKeyDef(keyDef)

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputTarget(e.target)) return
      if (!matchesEvent(parsed, e)) return
      e.preventDefault()
      handler()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyDef, handler, options?.enabled])
}
