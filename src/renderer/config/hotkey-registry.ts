export interface HotkeyEntry {
  key: string
  description: string
  category: 'view' | 'analysis' | 'edit'
}

const registry: HotkeyEntry[] = [
  { key: 'alt+p', description: '切换后处理开关', category: 'view' },
  { key: 'alt+shift+p', description: '切换 Studio/CAD 模式', category: 'view' },
  { key: 'alt+s', description: '切换剖面面板', category: 'analysis' },
  { key: 'alt+z', description: '切换斑马纹面板', category: 'analysis' },
  { key: 'alt+shift+z', description: '切换曲面分析面板', category: 'analysis' },
  { key: 'alt+d', description: '切换拔模分析面板', category: 'analysis' },
  { key: 'alt+c', description: '切换曲率梳面板', category: 'analysis' },
  { key: 'alt+r', description: '切换自动旋转', category: 'view' },
  { key: 'delete', description: '删除选中模型', category: 'edit' },
]

export function getAllHotkeys(): readonly HotkeyEntry[] {
  return registry
}

export function getHotkeyByKey(key: string): HotkeyEntry | undefined {
  return registry.find((h) => h.key === key)
}
