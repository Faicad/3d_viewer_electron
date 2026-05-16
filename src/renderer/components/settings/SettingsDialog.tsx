import { useUIStore } from '@/stores/ui-store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Settings, Monitor, Moon, Sun } from 'lucide-react'

export function SettingsDialog({ children }: { children?: React.ReactNode }) {
  const ui = useUIStore()

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? (
          <button className="flex items-center gap-2 text-sm cursor-pointer">
            <Settings className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{ui.language === 'zh' ? '设置' : 'Settings'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <SettingSection title={ui.language === 'zh' ? '主题' : 'Theme'}>
            <div className="flex gap-2">
              <ThemeOption value="light" label={ui.language === 'zh' ? '浅色' : 'Light'} icon={Sun} />
              <ThemeOption value="dark" label={ui.language === 'zh' ? '深色' : 'Dark'} icon={Moon} />
              <ThemeOption value="system" label={ui.language === 'zh' ? '跟随系统' : 'System'} icon={Monitor} />
            </div>
          </SettingSection>

          <SettingSection title={ui.language === 'zh' ? '语言' : 'Language'}>
            <LanguageOption value="zh" label="中文" />
            <LanguageOption value="en" label="English" />
            <LanguageOption value="system" label={ui.language === 'zh' ? '跟随系统' : 'System'} />
          </SettingSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ThemeOption({ value, label, icon: Icon }: {
  value: 'light' | 'dark' | 'system'; label: string; icon: React.ComponentType<{ className?: string }>
}) {
  const current = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  return (
    <button
      onClick={() => setTheme(value)}
      className={cn(
        'flex flex-1 flex-col items-center gap-1.5 p-3 rounded-md border text-sm transition-colors',
        current === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  )
}

function LanguageOption({ value, label }: {
  value: 'zh' | 'en' | 'system'; label: string
}) {
  const current = useUIStore((s) => s.language)
  const setLanguage = useUIStore((s) => s.setLanguage)

  return (
    <button
      onClick={() => setLanguage(value)}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors',
        current === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
      )}
    >
      {label}
    </button>
  )
}