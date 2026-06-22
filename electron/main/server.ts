import http from 'http'
import { BrowserWindow } from 'electron'

const REQUEST_TIMEOUT = 30_000

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

const pendingRequests = new Map<string, PendingRequest>()

function tryListen(server: http.Server, port: number, maxAttempts: number): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const attempt = (p: number, remaining: number) => {
      server.removeAllListeners('error')
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && remaining > 0) {
          server.close(() => attempt(p + 1, remaining - 1))
        } else {
          reject(err)
        }
      })
      server.listen(p, '127.0.0.1', () => {
        resolve({ server, port: p })
      })
    }
    attempt(port, maxAttempts)
  })
}

export async function startServer(preferredPort: number, getWindow: () => BrowserWindow | null): Promise<{ server: http.Server; port: number }> {
  const handler = createRequestHandler(getWindow)

  async function tryStart(port: number, retriesLeft: number): Promise<{ server: http.Server; port: number }> {
    const server = http.createServer(handler)
    try {
      const result = await tryListen(server, port, retriesLeft)
      console.log(`[Server] AI API server running at http://localhost:${result.port}`)
      console.log(`[Server] POST http://localhost:${result.port}/api/command`)
      return result
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code === 'EADDRINUSE' && retriesLeft > 0) {
        return tryStart(port + 1, retriesLeft - 1)
      }
      throw err
    }
  }

  return tryStart(preferredPort, 100)
}

function createRequestHandler(getWindow: () => BrowserWindow | null) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.url === '/api/command' && req.method === 'POST') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async () => {
        let cmd: any
        try {
          cmd = JSON.parse(body)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ type: '3d-viewer', status: 'error', error: 'Invalid JSON' }))
          return
        }

        let autoId = false
        if (!cmd.id) {
          cmd.id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          autoId = true
        }

        const resultPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingRequests.delete(cmd.id!)
            reject(new Error(`Command timeout: ${cmd.command}`))
          }, REQUEST_TIMEOUT)
          pendingRequests.set(cmd.id!, { resolve, reject, timer })
        })

        const win = getWindow()
        if (win) {
          win.webContents.send('ai:command', cmd)
        } else {
          pendingRequests.delete(cmd.id!)
          res.writeHead(503)
          res.end(JSON.stringify({ type: '3d-viewer', status: 'error', error: 'No window' }))
          return
        }

        try {
          const browserResult = await resultPromise
          if (autoId) {
            ;(browserResult as any)._warning =
              `Request missing 'id' field — auto-generated '${cmd.id}'. Always include an 'id' field in the request.`
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(browserResult))
        } catch (err) {
          res.writeHead(504, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            type: '3d-viewer', id: cmd.id, command: cmd.command,
            status: 'error', error: (err as Error).message,
          }))
        }
      })
      return
    }

    if (req.url === '/api/result' && req.method === 'POST') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        let payload: any
        try { payload = JSON.parse(body) } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }
        const { id, data, error } = payload
        const pending = pendingRequests.get(id)
        if (pending) {
          clearTimeout(pending.timer)
          pendingRequests.delete(id)
          if (error) pending.reject(new Error(error))
          else pending.resolve(data)
        }
        res.writeHead(200)
        res.end(JSON.stringify({ status: 'ok' }))
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  }
}

export function resolveRequest(id: string, data: unknown, error?: string): void {
  const pending = pendingRequests.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingRequests.delete(id)
  if (error) pending.reject(new Error(error))
  else pending.resolve(data)
}
