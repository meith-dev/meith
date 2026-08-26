'use client'

import { type Copy, fromCopy } from '../shell/copy-record'

export interface PasskeyProblem {
  readonly message: string
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesToBase64Url(buffer: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function passkeysAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.create === 'function'
  )
}

async function readProblem(response: Response, copy: Copy): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? fromCopy(copy, 'authForm.passkey.failed')
  } catch {
    return fromCopy(copy, 'authForm.passkey.failed')
  }
}

type Purpose = 'register' | 'authenticate' | 'second-factor' | 'credential-proof'

async function options(purpose: Purpose, copy: Copy): Promise<Record<string, unknown>> {
  const response = await fetch(`/auth/passkey/options?for=${purpose}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })

  if (!response.ok) throw new Error(await readProblem(response, copy))
  return (await response.json()) as Record<string, unknown>
}

async function submit(
  purpose: Purpose,
  body: Record<string, unknown>,
  copy: Copy,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/auth/passkey/verify?for=${purpose}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error(await readProblem(response, copy))
  return (await response.json()) as Record<string, unknown>
}

export async function enrolPasskey(label: string, copy: Copy): Promise<void> {
  const issued = await options('register', copy)

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: base64UrlToBytes(issued.challenge as string),
      rp: issued.rp as PublicKeyCredentialRpEntity,
      user: {
        ...(issued.user as { name: string; displayName: string }),
        id: base64UrlToBytes((issued.user as { id: string }).id),
      },
      pubKeyCredParams: issued.pubKeyCredParams as PublicKeyCredentialParameters[],
      excludeCredentials: (issued.excludeCredentials as { id: string }[]).map((entry) => ({
        type: 'public-key' as const,
        id: base64UrlToBytes(entry.id),
      })),
      authenticatorSelection: issued.authenticatorSelection as AuthenticatorSelectionCriteria,
      timeout: issued.timeout as number,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null

  if (credential === null) throw new Error(fromCopy(copy, 'authForm.passkey.noneCreated'))

  const response = credential.response as AuthenticatorAttestationResponse

  await submit(
    'register',
    {
      label,
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      attestationObject: bytesToBase64Url(response.attestationObject),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
    },
    copy,
  )
}

export async function signInWithPasskey(next: string | undefined, copy: Copy): Promise<string> {
  return assertPasskey('authenticate', next, copy)
}

export async function confirmWithPasskey(next: string | undefined, copy: Copy): Promise<string> {
  return assertPasskey('second-factor', next, copy)
}

export async function proveWithPasskey(next: string | undefined, copy: Copy): Promise<string> {
  return assertPasskey('credential-proof', next, copy)
}

async function assertPasskey(
  purpose: Exclude<Purpose, 'register'>,
  next: string | undefined,
  copy: Copy,
): Promise<string> {
  const issued = await options(purpose, copy)

  const allow = issued.allowCredentials as { id: string }[] | undefined

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: base64UrlToBytes(issued.challenge as string),
      rpId: issued.rpId as string,
      userVerification: issued.userVerification as UserVerificationRequirement,
      timeout: issued.timeout as number,
      ...(allow === undefined
        ? {}
        : {
            allowCredentials: allow.map((entry) => ({
              type: 'public-key' as const,
              id: base64UrlToBytes(entry.id),
            })),
          }),
    },
  })) as PublicKeyCredential | null

  if (credential === null) throw new Error(fromCopy(copy, 'authForm.passkey.noneOffered'))

  const response = credential.response as AuthenticatorAssertionResponse

  const outcome = await submit(
    purpose,
    {
      id: credential.id,
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      authenticatorData: bytesToBase64Url(response.authenticatorData),
      signature: bytesToBase64Url(response.signature),
      ...(next === undefined ? {} : { next }),
    },
    copy,
  )

  return typeof outcome.next === 'string' ? outcome.next : '/'
}

export function passkeyMessage(error: unknown, copy: Copy): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return fromCopy(copy, 'authForm.passkey.cancelled')
  }
  return error instanceof Error ? error.message : fromCopy(copy, 'authForm.passkey.failed')
}
