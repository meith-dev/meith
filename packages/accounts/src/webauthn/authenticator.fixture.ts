import { decodeBase64Url, encodeBase64Url } from '../crypto/base64url'

export type FixtureAlgorithm = 'ES256' | 'RS256' | 'EdDSA'

export function encodeCbor(value: unknown): Uint8Array {
  if (typeof value === 'number') {
    return value < 0 ? head(1, -1 - value) : head(0, value)
  }
  if (value instanceof Uint8Array) {
    return concat(head(2, value.length), value)
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value)
    return concat(head(3, bytes.length), bytes)
  }
  if (Array.isArray(value)) {
    return concat(head(4, value.length), ...value.map(encodeCbor))
  }
  if (value instanceof Map) {
    const parts: Uint8Array[] = [head(5, value.size)]
    for (const [key, entry] of value) {
      parts.push(encodeCbor(key), encodeCbor(entry))
    }
    return concat(...parts)
  }
  throw new Error('the fixture encoder does not know that shape')
}

function head(major: number, argument: number): Uint8Array {
  if (argument < 24) return Uint8Array.from([(major << 5) | argument])
  if (argument < 0x100) return Uint8Array.from([(major << 5) | 24, argument])
  if (argument < 0x10000) {
    return Uint8Array.from([(major << 5) | 25, argument >> 8, argument & 0xff])
  }
  return Uint8Array.from([
    (major << 5) | 26,
    (argument >>> 24) & 0xff,
    (argument >>> 16) & 0xff,
    (argument >>> 8) & 0xff,
    argument & 0xff,
  ])
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export interface FixtureResponse {
  readonly clientDataJSON: string
  readonly attestationObject: string
}

export interface FixtureAssertion {
  readonly clientDataJSON: string
  readonly authenticatorData: string
  readonly signature: string
}

export interface FixtureAuthenticator {
  readonly credentialId: string
  readonly publicKey: string
  register(input: {
    readonly challenge: string
    readonly origin: string
    readonly type?: string
    readonly rpId?: string
    readonly flags?: number
  }): Promise<FixtureResponse>
  assert(input: {
    readonly challenge: string
    readonly origin: string
    readonly type?: string
    readonly rpId?: string
    readonly signCount?: number
    readonly flags?: number
    readonly tamper?: boolean
  }): Promise<FixtureAssertion>
}

export async function createAuthenticator(input: {
  readonly rpId: string
  readonly algorithm?: FixtureAlgorithm
  readonly credentialId?: Uint8Array
}): Promise<FixtureAuthenticator> {
  const algorithm = input.algorithm ?? 'ES256'
  const credentialId = input.credentialId ?? Uint8Array.from({ length: 16 }, (_, i) => i + 1)

  const pair = (await crypto.subtle.generateKey(generateParams(algorithm), true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair

  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)

  const coseKey = encodeCbor(coseEntries(algorithm, jwk))

  const clientData = (type: string, challenge: string, origin: string): string =>
    encodeBase64Url(
      new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false })),
    )

  const authenticatorData = async (
    rpId: string,
    flags: number,
    signCount: number,
    attested: Uint8Array | null,
  ): Promise<Uint8Array> => {
    const rpIdHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)),
    )

    const counter = new Uint8Array(4)
    new DataView(counter.buffer).setUint32(0, signCount)

    if (attested === null) {
      return concat(rpIdHash, Uint8Array.from([flags]), counter)
    }

    const idLength = new Uint8Array(2)
    new DataView(idLength.buffer).setUint16(0, credentialId.length)

    return concat(
      rpIdHash,
      Uint8Array.from([flags]),
      counter,
      new Uint8Array(16),
      idLength,
      credentialId,
      attested,
    )
  }

  return {
    credentialId: encodeBase64Url(credentialId),
    publicKey: encodeBase64Url(coseKey),

    async register(request): Promise<FixtureResponse> {
      const authData = await authenticatorData(
        request.rpId ?? input.rpId,
        request.flags ?? 0b0100_0101,
        0,
        coseKey,
      )

      return {
        clientDataJSON: clientData(
          request.type ?? 'webauthn.create',
          request.challenge,
          request.origin,
        ),
        attestationObject: encodeBase64Url(
          encodeCbor(
            new Map<string, unknown>([
              ['fmt', 'none'],
              ['attStmt', new Map()],
              ['authData', authData],
            ]),
          ),
        ),
      }
    },

    async assert(request): Promise<FixtureAssertion> {
      const authData = await authenticatorData(
        request.rpId ?? input.rpId,
        request.flags ?? 0b0000_0101,
        request.signCount ?? 1,
        null,
      )

      const json = clientData(
        request.type ?? 'webauthn.get',
        request.challenge,
        request.origin,
      )

      const clientDataHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', decodeBase64Url(json)),
      )

      const raw = new Uint8Array(
        await crypto.subtle.sign(
          signParams(algorithm),
          pair.privateKey,
          concat(authData, clientDataHash),
        ),
      )

      const signature = algorithm === 'ES256' ? derFromRaw(raw) : raw
      if (request.tamper === true) {
        signature[signature.length - 1] = (signature[signature.length - 1] ?? 0) ^ 0xff
      }

      return {
        clientDataJSON: json,
        authenticatorData: encodeBase64Url(authData),
        signature: encodeBase64Url(signature),
      }
    },
  }
}

function generateParams(algorithm: FixtureAlgorithm): EcKeyGenParams | RsaHashedKeyGenParams | Algorithm {
  if (algorithm === 'ES256') return { name: 'ECDSA', namedCurve: 'P-256' }
  if (algorithm === 'EdDSA') return { name: 'Ed25519' }
  return {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }
}

function signParams(algorithm: FixtureAlgorithm): EcdsaParams | Algorithm {
  if (algorithm === 'ES256') return { name: 'ECDSA', hash: 'SHA-256' }
  if (algorithm === 'EdDSA') return { name: 'Ed25519' }
  return { name: 'RSASSA-PKCS1-v1_5' }
}

function coseEntries(
  algorithm: FixtureAlgorithm,
  jwk: JsonWebKey,
): Map<number, unknown> {
  if (algorithm === 'ES256') {
    return new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, decodeBase64Url(jwk.x!)],
      [-3, decodeBase64Url(jwk.y!)],
    ])
  }

  if (algorithm === 'EdDSA') {
    return new Map<number, unknown>([
      [1, 1],
      [3, -8],
      [-1, 6],
      [-2, decodeBase64Url(jwk.x!)],
    ])
  }

  return new Map<number, unknown>([
    [1, 3],
    [3, -257],
    [-1, decodeBase64Url(jwk.n!)],
    [-2, decodeBase64Url(jwk.e!)],
  ])
}

export function derFromRaw(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2
  const r = trim(raw.slice(0, half))
  const s = trim(raw.slice(half))

  const body = concat(
    Uint8Array.from([0x02, r.length]),
    r,
    Uint8Array.from([0x02, s.length]),
    s,
  )

  return concat(Uint8Array.from([0x30, body.length]), body)
}

function trim(value: Uint8Array): Uint8Array {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) start += 1

  const trimmed = value.slice(start)
  return trimmed[0]! > 0x7f ? concat(Uint8Array.from([0]), trimmed) : trimmed
}
