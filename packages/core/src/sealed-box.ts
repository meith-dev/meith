const VERSION = 'v1'

const IV_BYTES = 12

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function fromBase64Url(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64url'))
}

async function deriveKey(passphrase: string, purpose: string): Promise<CryptoKey> {
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
      info: new TextEncoder().encode(purpose) as unknown as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealValue(
  plaintext: string,
  passphrase: string,
  purpose: string,
): Promise<string> {
  const key = await deriveKey(passphrase, purpose)
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)

  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as unknown as BufferSource,
    ),
  )

  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(sealed)}`
}

export function isSealedValue(value: string): boolean {
  const parts = value.split('.')
  return parts.length === 3 && parts[0] === VERSION
}

export async function openValue(
  sealed: string,
  passphrase: string,
  purpose: string,
): Promise<string | null> {
  const parts = sealed.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null

  try {
    const key = await deriveKey(passphrase, purpose)
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(parts[1] as string) as unknown as BufferSource },
      key,
      fromBase64Url(parts[2] as string) as unknown as BufferSource,
    )
    return new TextDecoder().decode(opened)
  } catch {
    return null
  }
}
