import { decodeBase32, encodeBase32 } from './base32'

export const TOTP_PERIOD_SECONDS = 30

export const TOTP_DIGITS = 6

export const TOTP_SECRET_BYTES = 20

export const TOTP_SKEW_STEPS = 1

export function generateTotpSecret(byteLength = TOTP_SECRET_BYTES): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return encodeBase32(bytes)
}

export function stepAt(at: Date, period = TOTP_PERIOD_SECONDS): number {
  return Math.floor(at.getTime() / 1000 / period)
}

export async function totpCode(
  secret: string,
  step: number,
  digits = TOTP_DIGITS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase32(secret) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )

  const counter = new Uint8Array(8)
  new DataView(counter.buffer).setBigUint64(0, BigInt(step))

  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, counter as unknown as BufferSource),
  )

  const offset = mac[mac.length - 1]! & 0x0f
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!

  return String(binary % 10 ** digits).padStart(digits, '0')
}

export interface TotpMatch {
  readonly step: number
}

export async function matchTotp(input: {
  readonly secret: string
  readonly code: string
  readonly at: Date
  readonly skew?: number
  readonly digits?: number
  readonly period?: number
}): Promise<TotpMatch | null> {
  const digits = input.digits ?? TOTP_DIGITS
  const code = input.code.replace(/[\s-]/g, '')
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return null

  const skew = input.skew ?? TOTP_SKEW_STEPS
  const centre = stepAt(input.at, input.period ?? TOTP_PERIOD_SECONDS)

  for (let offset = -skew; offset <= skew; offset += 1) {
    const step = centre + offset
    if (step < 0) continue

    if (timingSafeCompare(await totpCode(input.secret, step, digits), code)) {
      return { step }
    }
  }

  return null
}

export function otpauthUri(input: {
  readonly secret: string
  readonly account: string
  readonly issuer: string
}): string {
  const issuer = input.issuer.trim() === '' ? 'Meith' : input.issuer.trim()
  const label = `${issuer}:${input.account}`

  const parameters = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })

  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}
