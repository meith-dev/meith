import { createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  encryptPushPayload,
  generateVapidKeys,
  isVapidPrivateKey,
  isVapidPublicKey,
  pushAudience,
  pushOutcomeFor,
  sendWebPush,
  type VapidDetails,
} from './push'

const ENDPOINT = 'https://push.example/send/abc123'

async function userAgent() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const raw = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey))
  const auth = randomBytes(16)

  return {
    keys: {
      endpoint: ENDPOINT,
      p256dh: raw.toString('base64url'),
      auth: auth.toString('base64url'),
    },
    async decrypt(body: Buffer): Promise<string> {
      const salt = body.subarray(0, 16)
      const idLength = body.readUInt8(20)
      const serverPublic = body.subarray(21, 21 + idLength)
      const sealed = body.subarray(21 + idLength)

      const server = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(serverPublic),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      )
      const shared = Buffer.from(
        await crypto.subtle.deriveBits({ name: 'ECDH', public: server }, pair.privateKey, 256),
      )

      const keyInfo = Buffer.concat([
        Buffer.from('WebPush: info\0', 'utf8'),
        raw,
        Buffer.from(serverPublic),
      ])
      const ikm = Buffer.from(hkdfSync('sha256', shared, auth, keyInfo, 32))
      const key = Buffer.from(
        hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
      )
      const nonce = Buffer.from(
        hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
      )

      const decipher = createDecipheriv('aes-128-gcm', key, nonce)
      decipher.setAuthTag(sealed.subarray(sealed.length - 16))
      const plaintext = Buffer.concat([
        decipher.update(sealed.subarray(0, sealed.length - 16)),
        decipher.final(),
      ])

      return plaintext.subarray(0, plaintext.length - 1).toString('utf8')
    },
  }
}

async function details(): Promise<VapidDetails> {
  return { ...(await generateVapidKeys()), subject: 'mailto:board@example.com' }
}

describe('VAPID keys', () => {
  it('generates a pair the board can recognise again', async () => {
    const keys = await generateVapidKeys()

    expect(isVapidPublicKey(keys.publicKey)).toBe(true)
    expect(isVapidPrivateKey(keys.privateKey)).toBe(true)
  })

  it('rejects a key of the wrong shape', () => {
    expect(isVapidPublicKey('not-a-key')).toBe(false)
    expect(isVapidPrivateKey(Buffer.alloc(31).toString('base64url'))).toBe(false)
  })

  it('names the push service, not the board, as the audience', () => {
    expect(pushAudience(ENDPOINT)).toBe('https://push.example')
  })
})

describe('the encrypted record', () => {
  it('is one the subscribing browser can open', async () => {
    const ua = await userAgent()

    const encrypted = await encryptPushPayload(ua.keys, JSON.stringify({ title: 'A reply' }))

    expect(encrypted.body.subarray(0, 16)).toEqual(encrypted.salt)
    expect(encrypted.body.readUInt32BE(16)).toBe(4096)
    expect(await ua.decrypt(encrypted.body)).toBe(JSON.stringify({ title: 'A reply' }))
  })

  it('refuses a payload no push service would carry', async () => {
    const ua = await userAgent()

    await expect(encryptPushPayload(ua.keys, 'x'.repeat(4000))).rejects.toThrow(/may not exceed/)
  })
})

describe('sending', () => {
  it('signs the request for the push service that will carry it', async () => {
    const ua = await userAgent()
    const vapid = await details()
    let seen: { url: string; headers: Record<string, string> } | null = null

    const result = await sendWebPush({
      subscription: ua.keys,
      payload: '{}',
      vapid,
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, headers: init.headers as Record<string, string> }
        return new Response(null, { status: 201 })
      }) as unknown as typeof fetch,
    })

    expect(result.outcome).toBe('sent')
    expect(seen!.url).toBe(ENDPOINT)
    expect(seen!.headers['content-encoding']).toBe('aes128gcm')
    expect(seen!.headers.authorization).toMatch(new RegExp(`k=${vapid.publicKey}$`))
  })

  it('signs a token the push service can verify', async () => {
    const ua = await userAgent()
    const vapid = await details()
    let authorization = ''

    await sendWebPush({
      subscription: ua.keys,
      payload: '{}',
      vapid,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        authorization = (init.headers as Record<string, string>).authorization ?? ''
        return new Response(null, { status: 201 })
      }) as unknown as typeof fetch,
    })

    const token = /t=([^,]+)/.exec(authorization)?.[1] ?? ''
    const [header, claims, signature] = token.split('.') as [string, string, string]

    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(Buffer.from(vapid.publicKey, 'base64url')),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )

    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new Uint8Array(Buffer.from(signature, 'base64url')),
      new Uint8Array(Buffer.from(`${header}.${claims}`)),
    )

    expect(verified).toBe(true)
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'))).toMatchObject({
      aud: 'https://push.example',
      sub: 'mailto:board@example.com',
    })
  })

  it('reads a gone subscription as gone and anything else as a failure', async () => {
    expect(pushOutcomeFor(201)).toBe('sent')
    expect(pushOutcomeFor(404)).toBe('gone')
    expect(pushOutcomeFor(410)).toBe('gone')
    expect(pushOutcomeFor(429)).toBe('failed')
    expect(pushOutcomeFor(500)).toBe('failed')
  })

  it('reports a push service that never answered as a failure', async () => {
    const ua = await userAgent()

    const result = await sendWebPush({
      subscription: ua.keys,
      payload: '{}',
      vapid: await details(),
      fetchImpl: (() => Promise.reject(new Error('socket hang up'))) as unknown as typeof fetch,
    })

    expect(result).toEqual({ outcome: 'failed', status: null, error: 'socket hang up' })
  })
})
