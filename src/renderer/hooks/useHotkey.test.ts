// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { useHotkey } from './useHotkey'

function createContainer() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

function cleanupContainer(container: HTMLDivElement) {
  document.body.removeChild(container)
}

describe('useHotkey', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(() => {
    cleanupContainer(container)
  })

  function mount(hook: () => void) {
    const root = createRoot(container)

    function Test() {
      hook()
      return null
    }

    React.act(() => { root.render(React.createElement(Test)) })

    return () => {
      React.act(() => { root.unmount() })
    }
  }

  function dispatch(key: string, options?: { altKey?: boolean; shiftKey?: boolean; target?: HTMLElement }) {
    const event = new KeyboardEvent('keydown', {
      key,
      altKey: options?.altKey ?? false,
      shiftKey: options?.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    })
    const t = options?.target ?? window
    t.dispatchEvent(event)
  }

  it('calls handler when matching key is pressed', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler))

    dispatch('p', { altKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call handler when modifiers do not match', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler))

    dispatch('p')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call handler when key does not match', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler))

    dispatch('r', { altKey: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler with shift modifier', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+shift+p', handler))

    dispatch('P', { altKey: true, shiftKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call handler when shift modifier is missing', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+shift+p', handler))

    dispatch('P', { altKey: true, shiftKey: false })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call handler when target is an INPUT element', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler))
    const input = document.createElement('input')
    document.body.appendChild(input)

    dispatch('p', { altKey: true, target: input })
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('does not call handler when target is a TEXTAREA element', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler))
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    dispatch('p', { altKey: true, target: textarea })
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(textarea)
  })

  it('does not call handler when target is contentEditable', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler))
    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)

    dispatch('p', { altKey: true, target: div })
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(div)
  })

  it('does not call handler after unmount', () => {
    const handler = vi.fn()
    const unmount = mount(() => useHotkey('alt+p', handler))

    unmount()

    dispatch('p', { altKey: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call handler when enabled is false', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler, { enabled: false }))

    dispatch('p', { altKey: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('handles delete key without modifiers', () => {
    const handler = vi.fn()
    mount(() => useHotkey('delete', handler))

    dispatch('Delete')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call handler when extra modifier is present', () => {
    const handler = vi.fn()
    mount(() => useHotkey('alt+p', handler))

    dispatch('P', { altKey: true, shiftKey: true })
    expect(handler).not.toHaveBeenCalled()
  })
})
