import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto'

import { env, isProduction } from '@meith/core'
import { assertAllowedUrl, guardedRequest } from '@meith/core/outbound'

export const PUSH_PAYLOAD_LIMIT = 3000

export const PUSH_RECORD_SIZE = 4096

export const PUSH_REQUEST_TIMEOUT_MS = 10_000

export const PUSH_TTL_SECONDS = 86_400

const VAPID_EXPIRY_SECONDS = 12 * 60 * 60

const CURVE: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' }

const SIGNING: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' }

export interface VapidKeyPair {
  readonly publicKey: string
  readonly privateKey: string
}

export interface VapidDetails extends VapidKeyPair {
  readonly subject: string
}

export interface PushSubscriptionKeys {
  readonly endpoint: string
  readonly p256dh: string
  readonly auth: string
}

export type PushSendOutcome = 'sent' | 'gone' | 'failed'

export interface PushSendResult {
  readonly outcome: PushSendOutcome
  readonly status: number | null
  readonly error: string | null
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function encode(value: ArrayBuffer | Uint8Array): string {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString(
    'base64url',
  )
}

function bytes(value: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value)
}

export async function generateVapidKeys(): Promise<VapidKeyPair> {
  const pair = await crypto.subtle.generateKey(SIGNING, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey)

  if (jwk.d === undefined) throw new Error('The generated key carries no private scalar.')

  return { publicKey: encode(raw), privateKey: jwk.d }
}

export function isVapidPublicKey(value: string): boolean {
  const raw = decode(value)
  return raw.length === 65 && raw[0] === 4
}

export function isVapidPrivateKey(value: string): boolean {
  return decode(value).length === 32
}

function jwkFor(keys: VapidKeyPair): JsonWebKey {
  const raw = decode(keys.publicKey)
  if (raw.length !== 65 || raw[0] !== 4) {
    throw new Error('A VAPID public key is a 65-byte uncompressed P-256 point.')
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: raw.subarray(1, 33).toString('base64url'),
    y: raw.subarray(33, 65).toString('base64url'),
    d: keys.privateKey,
    ext: true,
  }
}

export function pushAudience(endpoint: string): string {
  const url = new URL(endpoint)
  return `${url.protocol}//${url.host}`
}

export async function vapidAuthorization(
  vapid: VapidDetails,
  endpoint: string,
  now: Date = new Date(),
): Promise<string> {
  const header = encode(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = encode(
    Buffer.from(
      JSON.stringify({
        aud: pushAudience(endpoint),
        exp: Math.floor(now.getTime() / 1000) + VAPID_EXPIRY_SECONDS,
        sub: vapid.subject,
      }),
    ),
  )

  const key = await crypto.subtle.importKey('jwk', jwkFor(vapid), SIGNING, false, ['sign'])
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    bytes(Buffer.from(`${header}.${claims}`)),
  )

  return `vapid t=${header}.${claims}.${encode(signature)}, k=${vapid.publicKey}`
}

export interface EncryptedPushPayload {
  readonly body: Buffer
  readonly salt: Buffer
  readonly serverPublicKey: Buffer
}

export async function encryptPushPayload(
  subscription: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  payload: string,
  salt: Buffer = randomBytes(16),
): Promise<EncryptedPushPayload> {
  const plaintext = Buffer.from(payload, 'utf8')
  if (plaintext.byteLength > PUSH_PAYLOAD_LIMIT) {
    throw new Error(`A push payload may not exceed ${PUSH_PAYLOAD_LIMIT} bytes.`)
  }

  const clientPublic = decode(subscription.p256dh)
  const authSecret = decode(subscription.auth)

  const client = await crypto.subtle.importKey('raw', bytes(clientPublic), CURVE, false, [])
  const server = await crypto.subtle.generateKey(CURVE, true, ['deriveBits'])
  const serverPublic = Buffer.from(await crypto.subtle.exportKey('raw', server.publicKey))

  const shared = Buffer.from(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: client }, server.privateKey, 256),
  )

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    clientPublic,
    serverPublic,
  ])

  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32))
  const key = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
  )
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
  )

  const cipher = createCipheriv('aes-128-gcm', key, nonce)
  const sealed = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ])

  const header = Buffer.alloc(5)
  header.writeUInt32BE(PUSH_RECORD_SIZE, 0)
  header.writeUInt8(serverPublic.length, 4)

  return {
    body: Buffer.concat([salt, header, serverPublic, sealed]),
    salt,
    serverPublicKey: serverPublic,
  }
}

export function pushOutcomeFor(status: number): PushSendOutcome {
  if (status >= 200 && status < 300) return 'sent'
  if (status === 404 || status === 410) return 'gone'
  return 'failed'
}

export function pushAllowsPrivateHosts(): boolean {
  return env.PUSH_ALLOW_PRIVATE_HOSTS || !isProduction()
}

const guardedPushFetch: typeof fetch = (async (url: string, init: RequestInit) => {
  const allowPrivateHosts = pushAllowsPrivateHosts()
  const target = assertAllowedUrl(url, { allowPrivateHosts })
  const { status } = await guardedRequest({
    url: target,
    method: 'POST',
    headers: (init.headers ?? {}) as Record<string, string>,
    body: init.body as Uint8Array,
    timeoutMs: PUSH_REQUEST_TIMEOUT_MS,
    allowPrivateHosts,
  })
  return { status } as Response
}) as unknown as typeof fetch

export async function sendWebPush(input: {
  readonly subscription: PushSubscriptionKeys
  readonly payload: string
  readonly vapid: VapidDetails
  readonly ttlSeconds?: number
  readonly now?: Date
  readonly fetchImpl?: typeof fetch
}): Promise<PushSendResult> {
  const doFetch = input.fetchImpl ?? guardedPushFetch

  let encrypted: EncryptedPushPayload
  let authorization: string
  try {
    encrypted = await encryptPushPayload(input.subscription, input.payload)
    authorization = await vapidAuthorization(
      input.vapid,
      input.subscription.endpoint,
      input.now ?? new Date(),
    )
  } catch (err) {
    return { outcome: 'failed', status: null, error: message(err) }
  }

  try {
    const response = await doFetch(input.subscription.endpoint, {
      method: 'POST',
      headers: {
        authorization,
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(input.ttlSeconds ?? PUSH_TTL_SECONDS),
        urgency: 'normal',
      },
      body: bytes(encrypted.body),
      redirect: 'manual',
      signal: AbortSignal.timeout(PUSH_REQUEST_TIMEOUT_MS),
    })

    const outcome = pushOutcomeFor(response.status)
    return {
      outcome,
      status: response.status,
      error: outcome === 'sent' ? null : `HTTP ${response.status}`,
    }
  } catch (err) {
    return { outcome: 'failed', status: null, error: message(err) }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
