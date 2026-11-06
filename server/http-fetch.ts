import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { safeFetchUrl } from './security.js'

/** Only publicly routable A/AAAA answers can be used for an agent's web fetch. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number)
    if (a === undefined || b === undefined || c === undefined) return false
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && c <= 2) || (b === 88 && c === 99))) ||
        (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)) return false
    return true
  }
  if (family === 6) {
    // Mapped/compatible IPv4, ULA, link-local, loopback, multicast, reserved and documentation space.
    if (address.includes('.')) return false
    const prefix = parseInt(address.split(':')[0] ?? '', 16)
    if (!Number.isFinite(prefix) || prefix < 0x2000 || prefix > 0x3fff) return false
    if (/^2001:db8(?::|$)/i.test(address)) return false
    return true
  }
  return false
}

const MAX_BYTES = 100_000
const TIMEOUT_MS = 30_000

/** Pinned DNS lookup prevents an allowed public name rebinding to a private IP on connect. */
export async function fetchPublicText(rawUrl: string, signal: AbortSignal): Promise<string> {
  const url = safeFetchUrl(rawUrl)
  const addresses = await lookup(url.hostname, { all: true })
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error('Web target resolves to a non-public address')
  }
  const selected = addresses[0]!
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
  return await new Promise<string>((resolve, reject) => {
    const req = transport(url, {
      method: 'GET',
      signal,
      timeout: TIMEOUT_MS,
      headers: { 'user-agent': 'OpenGrokBot/1.0', accept: 'text/html,text/plain,application/json' },
      family: selected.family,
      lookup: (_host, _options, callback) => callback(null, selected.address, selected.family),
    }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) {
        res.resume()
        reject(new Error('Web redirects are disabled to prevent internal-network access'))
        return
      }
      const chunks: Buffer[] = []
      let bytes = 0
      res.on('data', (chunk: Buffer) => {
        if (bytes >= MAX_BYTES) return
        const remaining = MAX_BYTES - bytes
        const part = chunk.subarray(0, remaining)
        chunks.push(part)
        bytes += part.length
        if (bytes >= MAX_BYTES) {
          resolve(formatBody(status, Buffer.concat(chunks)))
          res.destroy()
        }
      })
      res.on('end', () => resolve(formatBody(status, Buffer.concat(chunks))))
      res.on('close', () => {
        if (bytes >= MAX_BYTES) resolve(formatBody(status, Buffer.concat(chunks)))
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('Web request timed out')))
    req.on('error', reject)
    req.end()
  })
}

function formatBody(status: number, bytes: Buffer): string {
  const text = bytes.toString('utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `HTTP ${status}\n${text.slice(0, 30_000)}`
}
