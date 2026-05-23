import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface ContextMenuItemDef {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  action: () => void
  disabled?: boolean
  danger?: boolean
}

interface ContextMenuProps {
  position: { x: number; y: number }
  items: ContextMenuItemDef[]
  onClose: () => void
}

export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Delay listener to avoid the same right-click event closing the menu
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
      document.addEventListener('contextmenu', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('contextmenu', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          disabled={item.disabled}
          onClick={() => {
            item.action()
            onClose()
          }}
          className={cn(
            'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
            'hover:bg-accent hover:text-accent-foreground',
            'disabled:pointer-events-none disabled:opacity-50',
            item.danger && 'text-destructive hover:text-destructive',
          )}
        >
          {item.icon && <item.icon className="mr-2 h-4 w-4" />}
          {item.label}
        </button>
      ))}
    </div>
  )
}
