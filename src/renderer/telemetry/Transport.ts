const PH_KEYS: Record<string, string> = {
  us: 'phc_ng3j7NF6yucxEUUF8VUZFSEjgpC9TApbkzodnXFksAfg',
}

const ENDPOINTS: Record<string, string> = {
  us: 'https://us.i.posthog.com/batch/',
}

export function hasTransport(region: string): boolean {
  return !!ENDPOINTS[region] && !!PH_KEYS[region]
}

export function sendBatch(region: string, events: unknown[]): void {
  const url = ENDPOINTS[region]
  const apiKey = PH_KEYS[region]
  if (!url || !apiKey) return

  const body = JSON.stringify({
    api_key: apiKey,
    batch: events,
  })

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, body)
    }
  })
}
