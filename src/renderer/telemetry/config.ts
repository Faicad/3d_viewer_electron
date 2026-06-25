const NS = '3d_viewer_electron-ty'

const isLocalStorageAvailable = typeof localStorage !== 'undefined'

function get(key: string): string | null {
  return isLocalStorageAvailable ? localStorage.getItem(`${NS}:${key}`) : null
}

function set(key: string, value: string): void {
  if (isLocalStorageAvailable) localStorage.setItem(`${NS}:${key}`, value)
}

function remove(key: string): void {
  if (isLocalStorageAvailable) localStorage.removeItem(`${NS}:${key}`)
}

export function getAnonymousId(): string {
  let id = get('anonymousId')
  if (!id) {
    id = crypto.randomUUID()
    set('anonymousId', id)
  }
  return id
}

export function isOptedOut(): boolean {
  return get('optedOut') === '1'
}

export function setOptedOut(v: boolean): void {
  if (v) set('optedOut', '1')
  else remove('optedOut')
}

export function isNoticeShown(): boolean {
  return get('noticeShown') === '1'
}

export function markNoticeShown(): void {
  set('noticeShown', '1')
}
