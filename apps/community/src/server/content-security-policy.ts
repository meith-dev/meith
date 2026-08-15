export interface PolicyOptions {
  readonly nonce: string
  readonly development?: boolean
  readonly remoteImages?: boolean
}

export function contentSecurityPolicy(options: PolicyOptions): string {
  const development = options.development ?? false
  const remoteImages = options.remoteImages ?? true

  return [
    "default-src 'self'",
    `img-src 'self' data:${remoteImages ? ' https:' : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${
      development ? " 'unsafe-eval'" : ''
    }`,
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export function newNonce(): string {
  return btoa(crypto.randomUUID())
}

export function readsAsAsset(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  return last.includes('.')
}
