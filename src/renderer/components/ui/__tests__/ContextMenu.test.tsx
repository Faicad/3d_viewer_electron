import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ContextMenu, type ContextMenuItemDef } from '../ContextMenu'

afterEach(() => { cleanup() })

function renderMenu(items: ContextMenuItemDef[], onClose = vi.fn()) {
  return render(
    <ContextMenu position={{ x: 100, y: 200 }} items={items} onClose={onClose} />,
  )
}

describe('ContextMenu', () => {
  it('renders all items', () => {
    const items: ContextMenuItemDef[] = [
      { label: 'Edit', action: vi.fn() },
      { label: 'Copy', action: vi.fn() },
      { label: 'Paste', action: vi.fn(), disabled: true },
    ]
    renderMenu(items)
    expect(screen.getByText('Edit')).toBeTruthy()
    expect(screen.getByText('Copy')).toBeTruthy()
    expect(screen.getByText('Paste')).toBeTruthy()
  })

  it('calls action and onClose on click', () => {
    const action = vi.fn()
    const onClose = vi.fn()
    const items: ContextMenuItemDef[] = [{ label: 'Edit', action }]
    renderMenu(items, onClose)

    fireEvent.click(screen.getByText('Edit'))
    expect(action).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('disabled items cannot be clicked', () => {
    const action = vi.fn()
    const items: ContextMenuItemDef[] = [{ label: 'Disabled', action, disabled: true }]
    renderMenu(items)

    const btn = screen.getByText('Disabled') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(action).not.toHaveBeenCalled()
  })

  it('renders at given position', () => {
    const items: ContextMenuItemDef[] = [{ label: 'Edit', action: vi.fn() }]
    const { container } = render(
      <ContextMenu position={{ x: 150, y: 250 }} items={items} onClose={vi.fn()} />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.left).toBe('150px')
    expect(el.style.top).toBe('250px')
  })
})
