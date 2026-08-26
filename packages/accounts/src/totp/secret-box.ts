import { ConfigurationError } from '@meith/core'

import { decodeBase64Url, encodeBase64Url } from '../crypto/base64url'

const VERSION = 'v1'

const IV_BYTES = 12

const INFO = new TextEncoder().encode('meith/two-factor-secret')

export async function sealSecret(plaintext: string, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase)
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)

  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as unknown as BufferSource,
    ),
  )

  return `${VERSION}.${encodeBase64Url(iv)}.${encodeBase64Url(sealed)}`
}

export async function openSecret(sealed: string, passphrase: string): Promise<string | null> {
  const parts = sealed.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null

  try {
    const key = await deriveKey(passphrase)

    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64Url(parts[1]!) as unknown as BufferSource },
      key,
      decodeBase64Url(parts[2]!) as unknown as BufferSource,
    )

    return new TextDecoder().decode(opened)
  } catch {
    return null
  }
}

export function assertSealingKey(passphrase: string | undefined): string {
  if (passphrase === undefined || passphrase.trim() === '') {
    throw new ConfigurationError(
      'Two-factor authentication needs AUTH_SECRET set, because the secret an ' +
        'authenticator app holds is sealed with a key derived from it.',
    )
  }
  return passphrase
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as unknown as BufferSource,
    'HKDF',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array() as unknown as BufferSource,
      info: INFO as unknown as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
