import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUpdateStore, type UpdateStatus } from '@/stores/update-store'
import { Download, RefreshCw } from 'lucide-react'

const SHOW_DIALOG: UpdateStatus[] = ['available', 'downloaded', 'error', 'not-available']

export function UpdateDialog() {
  const { t } = useTranslation()
  const status = useUpdateStore((s) => s.status)
  const version = useUpdateStore((s) => s.version)
  const downloadProgress = useUpdateStore((s) => s.downloadProgress)
  const errorMessage = useUpdateStore((s) => s.errorMessage)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)
  const quitAndInstall = useUpdateStore((s) => s.quitAndInstall)
  const reset = useUpdateStore((s) => s.reset)

  const [open, setOpen] = useState(false)
  const dismissedStatus = useRef<UpdateStatus | null>(null)

  useEffect(() => {
    if (SHOW_DIALOG.includes(status) && dismissedStatus.current !== status) {
      dismissedStatus.current = null
      setOpen(true)
    }
  }, [status])

  if (window.env.E2E) {
    return null
  }

  function handleClose() {
    setOpen(false)
    dismissedStatus.current = status
    if (status === 'not-available') {
      setTimeout(reset, 300)
    }
  }

  function handleUpdate() {
    if (status === 'available') {
      useUpdateStore.setState({ status: 'downloading', downloadProgress: 0 })
      window.electronAPI.checkForUpdates(true)
    } else if (status === 'downloaded') {
      quitAndInstall()
    }
  }

  function handleRetry() {
    reset()
    checkForUpdates(true)
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('update.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {status === 'checking' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>{t('update.checking')}</span>
            </div>
          )}

          {status === 'available' && version && (
            <>
              <p className="text-sm">{t('update.available', { version })}</p>
              <Button onClick={handleUpdate}>
                <Download className="h-4 w-4 mr-2" />
                {t('update.download')}
              </Button>
            </>
          )}

          {status === 'not-available' && (
            <p className="text-sm text-muted-foreground">{t('update.notAvailable')}</p>
          )}

          {status === 'downloading' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>{t('update.downloading')}</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">{Math.round(downloadProgress)}%</p>
            </div>
          )}

          {status === 'downloaded' && (
            <>
              <p className="text-sm">{t('update.downloaded', { version })}</p>
              <Button onClick={handleUpdate}>
                <Download className="h-4 w-4 mr-2" />
                {t('update.install')}
              </Button>
            </>
          )}

          {status === 'error' && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">{errorMessage || t('update.error')}</p>
              <Button variant="outline" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('update.retry')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
