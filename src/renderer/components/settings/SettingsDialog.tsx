import { useState, useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'
import { useUpdateStore } from '@/stores/update-store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Settings, Monitor, Moon, Sun, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '@/i18n'

function useUILanguage() {
  const language = useUIStore((s) => s.language)
  if (language === 'system') {
    return navigator.language.startsWith('zh') ? 'zh' : 'en'
  }
  return language as 'zh' | 'en'
}

export function SettingsDialog({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) {
  const isZh = useUILanguage()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion)
  }, [])

  const labels = {
    settings: isZh ? '设置' : 'Settings',
    theme: isZh ? '主题' : 'Theme',
    light: isZh ? '浅色' : 'Light',
    dark: isZh ? '深色' : 'Dark',
    system: isZh ? '跟随系统' : 'System',
    enablePreview: isZh ? '启用预览' : 'Enable Preview',
    telemetry: isZh ? '使用统计' : 'Usage Statistics',
    telemetryDesc: isZh ? '帮助我们改进产品' : 'Help us improve the product',
    language: isZh ? '语言' : 'Language',
    followSystem: isZh ? '跟随系统' : 'System',
    version: isZh ? '版本' : 'Version',
    blenderPath: isZh ? 'Blender 路径' : 'Blender Path',
    blenderAuto: isZh ? '自动检测' : 'Auto-detect',
    browse: isZh ? '浏览' : 'Browse',
    reset: isZh ? '重置' : 'Reset',
    blenderPathHint: isZh ? '留空则自动检测。打开 .blend 文件需要安装 Blender。' : 'Leave empty to auto-detect. Blender is required to open .blend files.',
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? (
          <button {...props} className="flex items-center gap-2 text-sm cursor-pointer">
            <Settings className="toolbar-icon h-4 w-4 text-stone-500" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{labels.settings}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <SettingSection title={labels.theme}>
            <div className="flex gap-2">
              <ThemeOption value="light" label={labels.light} icon={Sun} />
              <ThemeOption value="dark" label={labels.dark} icon={Moon} />
              <ThemeOption value="system" label={labels.system} icon={Monitor} />
            </div>
          </SettingSection>

          <SettingSection title={labels.enablePreview}>
            <PreviewOption />
          </SettingSection>

          <SettingSection title={labels.telemetry}>
            <TelemetryOption />
            <p className="text-xs text-muted-foreground">{labels.telemetryDesc}</p>
          </SettingSection>

          <SettingSection title={labels.language}>
            <div className="grid grid-cols-2 gap-2">
              <LanguageOption value="system" label={labels.followSystem} icon={Monitor} />
              {SUPPORTED_LANGUAGES.map((lang) => (
                <LanguageOption key={lang.code} value={lang.code} label={lang.name} />
              ))}
            </div>
          </SettingSection>

          <SettingSection title={labels.blenderPath}>
            <BlenderPathOption labels={labels} />
            <p className="text-xs text-muted-foreground">{labels.blenderPathHint}</p>
          </SettingSection>

          <SettingSection title={labels.version}>
            <VersionDisplay version={appVersion} />
            <UpdateCheckSection />
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

function LanguageOption({ value, label, icon: Icon }: {
  value: string; label: string; icon?: React.ComponentType<{ className?: string }>
}) {
  const current = useUIStore((s) => s.language)
  const setLanguage = useUIStore((s) => s.setLanguage)

  return (
    <button
      onClick={() => setLanguage(value as 'zh' | 'en' | 'system')}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors',
        current === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{label}</span>
      </div>
    </button>
  )
}

function VersionDisplay({ version }: { version: string }) {
  return (
    <div className="text-sm text-muted-foreground">
      {version}
    </div>
  )
}

function TelemetryOption() {
  const telemetryEnabled = useUIStore((s) => s.telemetryEnabled)
  const setTelemetryEnabled = useUIStore((s) => s.setTelemetryEnabled)

  return (
    <button
      onClick={() => setTelemetryEnabled(!telemetryEnabled)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        telemetryEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
          telemetryEnabled ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function PreviewOption() {
  const enablePreview = useUIStore((s) => s.enablePreview)
  const setEnablePreview = useUIStore((s) => s.setEnablePreview)

  return (
    <button
      onClick={() => setEnablePreview(!enablePreview)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        enablePreview ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
          enablePreview ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function UpdateCheckSection() {
  const status = useUpdateStore((s) => s.status)
  const errorMessage = useUpdateStore((s) => s.errorMessage)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)
  const isZh = useUILanguage()

  if (status === 'idle') {
    return (
      <button
        onClick={() => checkForUpdates(true)}
        className="mt-2 text-xs text-primary hover:underline cursor-pointer"
      >
        {isZh ? '检查更新' : 'Check for Updates'}
      </button>
    )
  }

  if (status === 'checking') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>{isZh ? '正在检查更新…' : 'Checking for updates…'}</span>
      </div>
    )
  }

  if (status === 'not-available') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
        <Check className="h-3 w-3" />
        <span>{isZh ? '已是最新版本' : "You're up to date"}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          <span>{errorMessage || (isZh ? '检查更新失败' : 'Update check failed')}</span>
        </div>
        <button
          onClick={() => checkForUpdates(true)}
          className="text-xs text-primary hover:underline cursor-pointer text-left"
        >
          {isZh ? '重试' : 'Retry'}
        </button>
      </div>
    )
  }

  return null
}

function BlenderPathOption({ labels }: { labels: Record<string, string> }) {
  const blenderPath = useUIStore((s) => s.blenderPath)
  const setBlenderPath = useUIStore((s) => s.setBlenderPath)
  const [selecting, setSelecting] = useState(false)
 
  const handleBrowse = async () => {
    setSelecting(true)
    try {
      const result = await window.electronAPI.blendSelectExe()
      if (result.success && result.path) {
        setBlenderPath(result.path)
      }
    } finally {
      setSelecting(false)
    }
  }
 
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={blenderPath || labels.blenderAuto}
        className="flex-1 rounded border px-2 py-1 text-sm bg-muted truncate"
      />
      <button
        className="px-3 py-1 text-sm rounded border hover:bg-accent"
        onClick={handleBrowse}
        disabled={selecting}
      >
        {labels.browse}
      </button>
      <button
        className="px-3 py-1 text-sm rounded border hover:bg-accent"
        onClick={() => setBlenderPath('')}
        disabled={!blenderPath}
      >
        {labels.reset}
      </button>
    </div>
  )
}
