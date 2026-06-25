const FILE_PATH_RE = /(\/(Users|home|root|opt|app|workspace|srv|mnt|var|tmp)\/[^\s"']+)/g
const FILE_URL_RE = /file:\/\/\/[^\s"']+/g
const URL_QUERY_RE = /(\?[^\s"']+)/g

export function redactTelemetryString(value: string, maxLength = 1000): string {
  let result = value
    .replace(FILE_URL_RE, '[file-url]')
    .replace(FILE_PATH_RE, '[path]')
    .replace(URL_QUERY_RE, '?…')
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + '…'
  }
  return result
}
