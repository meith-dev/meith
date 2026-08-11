import { createHmac, timingSafeEqual } from 'node:crypto'

export const STRIPE_SIGNATURE_HEADER = 'stripe-signature'
export const SIGNATURE_TOLERANCE_SECONDS = 300

export type SignatureVerdict =
  | { readonly ok: true; readonly timestamp: number }
  | { readonly ok: false; readonly reason: 'missing' | 'malformed' | 'stale' | 'mismatch' }

export function verifyStripeSignature(
  rawBody: Uint8Array,
  header: string | null | undefined,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): SignatureVerdict {
  if (header === null || header === undefined || header === '') {
    return { ok: false, reason: 'missing' }
  }

  let timestamp: number | null = null
  const signatures: string[] = []

  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') timestamp = Number(value)
    if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) signatures.push(value)
  }

  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  const age = Math.abs(now.getTime() / 1000 - timestamp)
  if (age > toleranceSeconds) return { ok: false, reason: 'stale' }

  const mac = createHmac('sha256', secret)
  mac.update(`${timestamp}.`, 'utf8')
  mac.update(rawBody)
  const expected = mac.digest()

  for (const candidate of signatures) {
    const presented = Buffer.from(candidate, 'hex')
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      return { ok: true, timestamp }
    }
  }

  return { ok: false, reason: 'mismatch' }
}

export function signStripePayload(
  rawBody: Uint8Array | string,
  secret: string,
  timestamp: number,
): string {
  const mac = createHmac('sha256', secret)
  mac.update(`${timestamp}.`, 'utf8')
  mac.update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
  return `t=${timestamp},v1=${mac.digest('hex')}`
}
