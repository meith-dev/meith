"use client"

export interface PasskeyProblem {
  readonly message: string
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesToBase64Url(buffer: ArrayBuffer): string {
  let binary = ""
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function passkeysAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  )
}

async function readProblem(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? "That did not work. Try again."
  } catch {
    return "That did not work. Try again."
  }
}

type Purpose = "register" | "authenticate" | "second-factor"

async function options(purpose: Purpose): Promise<Record<string, unknown>> {
  const response = await fetch(`/auth/passkey/options?for=${purpose}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  })

  if (!response.ok) throw new Error(await readProblem(response))
  return (await response.json()) as Record<string, unknown>
}

async function submit(
  purpose: Purpose,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/auth/passkey/verify?for=${purpose}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error(await readProblem(response))
  return (await response.json()) as Record<string, unknown>
}

export async function enrolPasskey(label: string): Promise<void> {
  const issued = await options("register")

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
        type: "public-key" as const,
        id: base64UrlToBytes(entry.id),
      })),
      authenticatorSelection:
        issued.authenticatorSelection as AuthenticatorSelectionCriteria,
      timeout: issued.timeout as number,
      attestation: "none",
    },
  })) as PublicKeyCredential | null

  if (credential === null) throw new Error("No passkey was created.")

  const response = credential.response as AuthenticatorAttestationResponse

  await submit("register", {
    label,
    clientDataJSON: bytesToBase64Url(response.clientDataJSON),
    attestationObject: bytesToBase64Url(response.attestationObject),
    transports:
      typeof response.getTransports === "function" ? response.getTransports() : [],
  })
}

export async function signInWithPasskey(next: string | undefined): Promise<string> {
  return assertPasskey("authenticate", next)
}

/**
 * The same exchange, against a sign-in that has already given its password.
 * The board scopes the challenge to that member's own credentials, so the
 * browser offers only the keys that could finish this particular sign-in.
 */
export async function confirmWithPasskey(next: string | undefined): Promise<string> {
  return assertPasskey("second-factor", next)
}

async function assertPasskey(
  purpose: Exclude<Purpose, "register">,
  next: string | undefined,
): Promise<string> {
  const issued = await options(purpose)

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
              type: "public-key" as const,
              id: base64UrlToBytes(entry.id),
            })),
          }),
    },
  })) as PublicKeyCredential | null

  if (credential === null) throw new Error("No passkey was offered.")

  const response = credential.response as AuthenticatorAssertionResponse

  const outcome = await submit(purpose, {
    id: credential.id,
    clientDataJSON: bytesToBase64Url(response.clientDataJSON),
    authenticatorData: bytesToBase64Url(response.authenticatorData),
    signature: bytesToBase64Url(response.signature),
    ...(next === undefined ? {} : { next }),
  })

  return typeof outcome.next === "string" ? outcome.next : "/"
}

export function passkeyMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "That was cancelled, so nothing changed."
  }
  return error instanceof Error ? error.message : "That did not work. Try again."
}
