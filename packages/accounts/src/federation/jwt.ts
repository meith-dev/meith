import { InternalError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { decodeBase64Url, decodeBase64UrlText } from '../crypto/base64url'
import { fetchJson } from './http'
import type { Fetcher } from './types'

interface VerifyAlgorithm {
  readonly importParams: RsaHashedImportParams | EcKeyImportParams
  readonly verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams
}

const ALGORITHMS: Readonly<Record<string, VerifyAlgorithm>> = {
  RS256: {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
  },
  RS384: {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
  },
  RS512: {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
  },
  PS256: {
    importParams: { name: 'RSA-PSS', hash: 'SHA-256' },
    verifyParams: { name: 'RSA-PSS', saltLength: 32 },
  },
  ES256: {
    importParams: { name: 'ECDSA', namedCurve: 'P-256' },
    verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
  },
  ES384: {
    importParams: { name: 'ECDSA', namedCurve: 'P-384' },
    verifyParams: { name: 'ECDSA', hash: 'SHA-384' },
  },
}

const CLOCK_SKEW_SECONDS = 120

export interface IdTokenClaims {
  readonly [claim: string]: unknown
}

export interface VerifyIdTokenInput {
  readonly token: string
  readonly issuer: string
  readonly audience: string
  readonly nonce: string | null
  readonly jwksUri: string
  readonly fetcher: Fetcher
  readonly now: Date
}

export async function verifyIdToken(input: VerifyIdTokenInput): Promise<IdTokenClaims> {
  const parts = input.token.split('.')
  if (parts.length !== 3) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-token-jwt'))
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string]
  const header = parseJson(encodedHeader, 'header')
  const claims = parseJson(encodedPayload, 'payload')

  const algorithm = ALGORITHMS[stringClaim(header, 'alg') ?? '']
  if (algorithm === undefined) {
    throw new ValidationError(msg('error.accounts.identity-provider-signed-its-token'))
  }

  const key = await importSigningKey({
    jwksUri: input.jwksUri,
    fetcher: input.fetcher,
    kid: stringClaim(header, 'kid'),
    algorithm,
  })

  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  const signature = decodeBase64Url(encodedSignature)

  const verified = await crypto.subtle.verify(
    algorithm.verifyParams,
    key,
    signature as unknown as BufferSource,
    signed as unknown as BufferSource,
  )
  if (!verified) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-token-with'))
  }

  assertClaims(claims, input)
  return claims
}

function assertClaims(claims: IdTokenClaims, input: VerifyIdTokenInput): void {
  const issuer = stringClaim(claims, 'iss')
  if (issuer === null || !sameIssuer(issuer, input.issuer)) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-token-issued'))
  }

  const audience = claims.aud
  const audiences = Array.isArray(audience) ? audience : [audience]
  if (!audiences.includes(input.audience)) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-token-meant'))
  }

  const seconds = Math.floor(input.now.getTime() / 1000)

  const expiry = numberClaim(claims, 'exp')
  if (expiry === null || expiry + CLOCK_SKEW_SECONDS < seconds) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-token-expired'))
  }

  const issuedAt = numberClaim(claims, 'iat')
  if (issuedAt !== null && issuedAt - CLOCK_SKEW_SECONDS > seconds) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-token-issued-2'))
  }

  if (input.nonce !== null && stringClaim(claims, 'nonce') !== input.nonce) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-token-for'))
  }
}

function sameIssuer(left: string, right: string): boolean {
  return left.replace(/\/$/, '') === right.replace(/\/$/, '')
}

async function importSigningKey(input: {
  readonly jwksUri: string
  readonly fetcher: Fetcher
  readonly kid: string | null
  readonly algorithm: VerifyAlgorithm
}): Promise<CryptoKey> {
  const document = await fetchJson(
    input.fetcher,
    input.jwksUri,
    { headers: { accept: 'application/json' } },
    'fetch its signing keys',
  )

  const keys = (document as { keys?: unknown }).keys
  if (!Array.isArray(keys)) {
    throw new InternalError('The identity provider published no signing keys.')
  }

  const candidates = keys.filter(
    (key): key is JsonWebKey & { kid?: string } => typeof key === 'object' && key !== null,
  )

  const matched =
    input.kid === null
      ? candidates
      : candidates.filter((key) => key.kid === undefined || key.kid === input.kid)

  for (const jwk of matched.length > 0 ? matched : candidates) {
    try {
      return await crypto.subtle.importKey(
        'jwk',
        { ...jwk, ext: true, key_ops: ['verify'] },
        input.algorithm.importParams,
        false,
        ['verify'],
      )
    } catch {}
  }

  throw new InternalError('None of the identity provider signing keys could verify this token.')
}

function parseJson(segment: string, what: string): IdTokenClaims {
  try {
    const parsed = JSON.parse(decodeBase64UrlText(segment)) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as IdTokenClaims
  } catch (cause) {
    throw new ValidationError(
      `The identity provider sent a token whose ${what} is unreadable.`,
      {},
      {
        cause,
      },
    )
  }
}

export function stringClaim(claims: IdTokenClaims, key: string): string | null {
  const value = claims[key]
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function numberClaim(claims: IdTokenClaims, key: string): number | null {
  const value = claims[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
