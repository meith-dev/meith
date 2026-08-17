import { encodeBase64Url } from '../crypto/base64url'
import { type CborValue, cborMap, decodeCbor } from './cbor'

export type CoseAlgorithm = -7 | -8 | -257

export const SUPPORTED_ALGORITHMS: readonly CoseAlgorithm[] = [-7, -257, -8]

const KTY = 1
const ALG = 3
const CRV = -1
const X = -2
const Y = -3
const RSA_MODULUS = -1
const RSA_EXPONENT = -2

interface ImportedKey {
  readonly jwk: JsonWebKey
  readonly importParams: RsaHashedImportParams | EcKeyImportParams | AlgorithmIdentifier
  readonly verifyParams: AlgorithmIdentifier | EcdsaParams
  readonly derSignature: boolean
}

export function algorithmOf(publicKey: Uint8Array): CoseAlgorithm {
  const key = cborMap(decodeCbor(publicKey).value)
  const alg = key.get(ALG)
  if (alg === -7 || alg === -8 || alg === -257) return alg
  throw new Error('unsupported COSE algorithm')
}

export async function importCoseKey(publicKey: Uint8Array): Promise<{
  readonly key: CryptoKey
  readonly verifyParams: AlgorithmIdentifier | EcdsaParams
  readonly derSignature: boolean
}> {
  const described = describe(cborMap(decodeCbor(publicKey).value))

  const key = await crypto.subtle.importKey('jwk', described.jwk, described.importParams, false, [
    'verify',
  ])

  return {
    key,
    verifyParams: described.verifyParams,
    derSignature: described.derSignature,
  }
}

function describe(key: ReadonlyMap<CborValue, CborValue>): ImportedKey {
  const kty = key.get(KTY)
  const alg = key.get(ALG)

  if (kty === 2 && alg === -7) {
    if (key.get(CRV) !== 1) throw new Error('unsupported elliptic curve')
    return {
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: coordinate(key.get(X)),
        y: coordinate(key.get(Y)),
      },
      importParams: { name: 'ECDSA', namedCurve: 'P-256' },
      verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
      derSignature: true,
    }
  }

  if (kty === 3 && alg === -257) {
    return {
      jwk: {
        kty: 'RSA',
        n: coordinate(key.get(RSA_MODULUS)),
        e: coordinate(key.get(RSA_EXPONENT)),
        alg: 'RS256',
      },
      importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
      derSignature: false,
    }
  }

  if (kty === 1 && alg === -8) {
    if (key.get(CRV) !== 6) throw new Error('unsupported edwards curve')
    return {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: coordinate(key.get(X)) } as JsonWebKey,
      importParams: { name: 'Ed25519' },
      verifyParams: { name: 'Ed25519' },
      derSignature: false,
    }
  }

  throw new Error('unsupported COSE key type')
}

function coordinate(value: CborValue | undefined): string {
  if (!(value instanceof Uint8Array)) throw new Error('malformed COSE key')
  return encodeBase64Url(value)
}

export function rawSignatureFromDer(signature: Uint8Array, coordinateBytes = 32): Uint8Array {
  if (signature[0] !== 0x30) throw new Error('malformed ECDSA signature')

  let offset = 2
  if (signature[1] !== undefined && signature[1] > 0x80) offset += signature[1] - 0x80

  const readInteger = (): Uint8Array => {
    if (signature[offset] !== 0x02) throw new Error('malformed ECDSA signature')
    const length = signature[offset + 1]
    if (length === undefined) throw new Error('malformed ECDSA signature')
    const start = offset + 2
    offset = start + length
    return signature.slice(start, offset)
  }

  const r = readInteger()
  const s = readInteger()

  const out = new Uint8Array(coordinateBytes * 2)
  out.set(pad(r, coordinateBytes), 0)
  out.set(pad(s, coordinateBytes), coordinateBytes)
  return out
}

function pad(value: Uint8Array, size: number): Uint8Array {
  const trimmed = value[0] === 0 ? value.slice(1) : value
  if (trimmed.length > size) throw new Error('malformed ECDSA signature')

  const out = new Uint8Array(size)
  out.set(trimmed, size - trimmed.length)
  return out
}
