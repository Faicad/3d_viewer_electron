const isProd = typeof window !== 'undefined' && window.env?.PROD

const noop = () => {}

export function initLogger(): void {
  if (!isProd) return

  console.log = noop
  console.warn = noop
  console.debug = noop
  console.info = noop
}
