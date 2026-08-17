import { ValidationError } from '@meith/core'

import { decodeBase64Url, encodeBase64Url } from '../crypto/base64url'
import { cborBytes, cborMap, decodeCbor } from './cbor'
import { importCoseKey, rawSignatureFromDer } from './cose'

const FLAG_USER_PRESENT = 0b0000_0001
const FLAG_USER_VERIFIED = 0b0000_0100
const FLAG_ATTESTED_CREDENTIAL = 0b0100_0000

export interface RelyingParty {
  readonly id: string
  readonly origin: string
}

export interface RegistrationResponse {
  readonly clientDataJSON: string
  readonly attestationObject: string
  readonly transports?: readonly string[]
}

export interface RegisteredCredential {
  readonly credentialId: string
  readonly publicKey: string
  readonly signCount: number
  readonly userVerified: boolean
}

export interface AssertionResponse {
  readonly clientDataJSON: string
  readonly authenticatorData: string
  readonly signature: string
}

const REFUSED = 'That passkey could not be verified. Try again.'

export async function verifyRegistration(input: {
  readonly response: RegistrationResponse
  readonly expectedChallenge: string
  readonly relyingParty: RelyingParty
}): Promise<RegisteredCredential> {
  assertClientData({
    clientDataJSON: input.response.clientDataJSON,
    expectedType: 'webauthn.create',
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.relyingParty.origin,
  })

  const attestation = decodeOrRefuse(() =>
    cborMap(decodeCbor(decodeBase64Url(input.response.attestationObject)).value),
  )
  const authData = decodeOrRefuse(() => cborBytes(attestation.get('authData')))
  const parsed = await parseAuthenticatorData(authData, input.relyingParty.id)

  if (!parsed.userPresent) {
    throw new ValidationError('That passkey was not confirmed on the device.')
  }

  const credential = parsed.credential
  if (credential === null) throw new ValidationError(REFUSED)

  await decodeOrRefuseAsync(() => importCoseKey(credential.publicKey))

  return {
    credentialId: encodeBase64Url(credential.credentialId),
    publicKey: encodeBase64Url(credential.publicKey),
    signCount: parsed.signCount,
    userVerified: parsed.userVerified,
  }
}

export async function verifyAssertion(input: {
  readonly response: AssertionResponse
  readonly expectedChallenge: string
  readonly relyingParty: RelyingParty
  readonly publicKey: string
  readonly storedSignCount: number
}): Promise<{ readonly signCount: number }> {
  assertClientData({
    clientDataJSON: input.response.clientDataJSON,
    expectedType: 'webauthn.get',
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.relyingParty.origin,
  })

  const authData = decodeBase64Url(input.response.authenticatorData)
  const parsed = await parseAuthenticatorData(authData, input.relyingParty.id)

  if (!parsed.userPresent) {
    throw new ValidationError('That passkey was not confirmed on the device.')
  }

  const imported = await decodeOrRefuseAsync(() => importCoseKey(decodeBase64Url(input.publicKey)))

  const clientDataHash = await sha256(decodeBase64Url(input.response.clientDataJSON))
  const signed = concat(authData, clientDataHash)

  const raw = decodeBase64Url(input.response.signature)
  const signature = imported.derSignature ? rawSignatureFromDer(raw) : raw

  const verified = await crypto.subtle.verify(
    imported.verifyParams,
    imported.key,
    signature as unknown as BufferSource,
    signed as unknown as BufferSource,
  )

  if (!verified) throw new ValidationError(REFUSED)

  if (parsed.signCount > 0 && parsed.signCount <= input.storedSignCount) {
    throw new ValidationError(
      'That passkey replayed a counter the board has already seen, so it was refused.',
    )
  }

  return { signCount: parsed.signCount }
}

interface ParsedAuthenticatorData {
  readonly userPresent: boolean
  readonly userVerified: boolean
  readonly signCount: number
  readonly credential: {
    readonly credentialId: Uint8Array
    readonly publicKey: Uint8Array
  } | null
}

async function parseAuthenticatorData(
  authData: Uint8Array,
  rpId: string,
): Promise<ParsedAuthenticatorData> {
  if (authData.length < 37) throw new ValidationError(REFUSED)

  const expectedRpIdHash = await sha256(new TextEncoder().encode(rpId))
  if (!sameBytes(authData.subarray(0, 32), expectedRpIdHash)) {
    throw new ValidationError('That passkey belongs to a different site.')
  }

  const flags = authData[32]!
  const signCount = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0)

  if ((flags & FLAG_ATTESTED_CREDENTIAL) === 0) {
    return {
      userPresent: (flags & FLAG_USER_PRESENT) !== 0,
      userVerified: (flags & FLAG_USER_VERIFIED) !== 0,
      signCount,
      credential: null,
    }
  }

  const idLength = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0)
  const idStart = 55
  const idEnd = idStart + idLength
  if (idEnd > authData.length || idLength === 0) throw new ValidationError(REFUSED)

  const keyBytes = authData.subarray(idEnd)
  const key = decodeOrRefuse(() => decodeCbor(keyBytes))

  return {
    userPresent: (flags & FLAG_USER_PRESENT) !== 0,
    userVerified: (flags & FLAG_USER_VERIFIED) !== 0,
    signCount,
    credential: {
      credentialId: authData.slice(idStart, idEnd),
      publicKey: keyBytes.slice(0, key.length),
    },
  }
}

function assertClientData(input: {
  readonly clientDataJSON: string
  readonly expectedType: string
  readonly expectedChallenge: string
  readonly expectedOrigin: string
}): void {
  let data: Record<string, unknown>
  try {
    const decoded = new TextDecoder().decode(decodeBase64Url(input.clientDataJSON))
    const parsed = JSON.parse(decoded) as unknown
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    data = parsed as Record<string, unknown>
  } catch (cause) {
    throw new ValidationError(REFUSED, {}, { cause })
  }

  if (data.type !== input.expectedType) throw new ValidationError(REFUSED)

  if (typeof data.challenge !== 'string' || data.challenge !== input.expectedChallenge) {
    throw new ValidationError(
      'That sign-in attempt has expired or was started somewhere else. Try again.',
    )
  }

  if (typeof data.origin !== 'string' || data.origin !== input.expectedOrigin) {
    throw new ValidationError('That passkey was used against a different address.')
  }
}

function decodeOrRefuse<T>(read: () => T): T {
  try {
    return read()
  } catch (cause) {
    throw new ValidationError(REFUSED, {}, { cause })
  }
}

async function decodeOrRefuseAsync<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (cause) {
    throw new ValidationError(REFUSED, {}, { cause })
  }
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.length + right.length)
  out.set(left, 0)
  out.set(right, left.length)
  return out
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index]! ^ right[index]!
  }
  return diff === 0
}
