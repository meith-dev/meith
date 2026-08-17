import { encodeBase64Url, randomBase64Url } from '../crypto/base64url'

export interface HandshakeSecrets {
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
}

export function newHandshake(): HandshakeSecrets {
  return {
    state: randomBase64Url(32),
    nonce: randomBase64Url(32),
    codeVerifier: randomBase64Url(32),
  }
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return encodeBase64Url(new Uint8Array(digest))
}
