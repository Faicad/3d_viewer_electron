import https from 'https'
import crypto from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HOST = 'tts.tencentcloudapi.com'
const SERVICE = 'tts'
const VERSION = '2019-08-23'

function loadEnv() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env')
  if (!existsSync(envPath)) return {}
  const envFile = readFileSync(envPath, 'utf8')
  const vars = {}
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return vars
}

const env = loadEnv()
const SECRET_ID = env.TENCENT_SECRET_ID
const SECRET_KEY = env.TENCENT_SECRET_KEY

function sha256(msg) {
  return crypto.createHash('sha256').update(msg).digest('hex')
}

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest()
}

function getAuth(secretId, secretKey, payload) {
  const now = Math.floor(Date.now() / 1000)
  const date = new Date(now * 1000).toISOString().slice(0, 10)

  const canonical = [
    'POST', '/', '',
    'content-type:application/json',
    'host:' + HOST, '',
    'content-type;host',
    sha256(payload),
  ].join('\n')

  const toSign = [
    'TC3-HMAC-SHA256',
    now,
    date + '/' + SERVICE + '/tc3_request',
    sha256(canonical),
  ].join('\n')

  const sd = hmac('TC3' + secretKey, date)
  const ss = hmac(sd, SERVICE)
  const s = hmac(ss, 'tc3_request')
  const sig = hmac(s, toSign).toString('hex')

  return {
    auth: 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + date + '/' + SERVICE + '/tc3_request, SignedHeaders=content-type;host, Signature=' + sig,
    timestamp: now,
  }
}

function call(text) {
  const payload = JSON.stringify({
    Text: text,
    SessionId: 's-' + Date.now(),
    VoiceType: 200000000,
    FastVoiceType: 'WCHN-7028cbcfea0840858ea2116dae34024e',
    Codec: 'mp3',
  })

  const { auth, timestamp } = getAuth(SECRET_ID, SECRET_KEY, payload)

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': HOST,
        'X-TC-Action': 'TextToVoice',
        'X-TC-Version': VERSION,
        'X-TC-Timestamp': timestamp,
        'Authorization': auth,
        'X-TC-Region': '',
      },
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        const result = JSON.parse(body)
        if (result.Response.Error) {
          reject(result.Response.Error)
        } else {
          resolve(result.Response)
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function probeDuration(filePath) {
  if (!existsSync(filePath)) return 0
  const r = spawnSync('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', filePath,
  ], { stdio: 'pipe', timeout: 10000 })
  if (r.status !== 0) return 0
  const dur = parseFloat(r.stdout.toString().trim())
  return isNaN(dur) ? 0 : dur
}

export async function generateTencentTts(text, outPath) {
  if (!SECRET_ID || !SECRET_KEY) {
    console.error('  TENCENT_SECRET_ID or TENCENT_SECRET_KEY not set in .env')
    return null
  }
  try {
    const resp = await call(text)
    const buf = Buffer.from(resp.Audio, 'base64')
    writeFileSync(outPath, buf)
    const duration = probeDuration(outPath)
    if (duration <= 0) {
      console.error('  Cannot probe duration of', outPath)
      return null
    }
    return { path: outPath, duration }
  } catch (err) {
    console.error('  tencent-tts failed:', err.Code || err.message || err)
    return null
  }
}
