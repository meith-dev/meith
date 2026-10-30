export interface PolicyOptions {
  readonly nonce: string
  readonly development?: boolean
  readonly remoteImages?: boolean
}

export function contentSecurityPolicy(options: PolicyOptions): string {
  const development = options.development ?? false
  const remoteImages = options.remoteImages ?? false

  return [
    "default-src 'self'",
    `img-src 'self' data:${remoteImages ? ' https:' : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${
      development ? " 'unsafe-eval'" : ''
    }`,
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
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
  return (
    [
      '/robots.txt',
      '/feed.xml',
      '/atom.xml',
      '/sitemap.xml',
      '/icon',
      '/apple-icon',
      '/brand/favicon',
      '/manifest.webmanifest',
      '/api/v1/openapi.json',
      '/brand/icon-192.png',
      '/brand/icon-512.png',
      '/brand/icon-maskable.png',
      '/sw.js',
      '/placeholder.svg',
      '/placeholder.jpg',
      '/placeholder-user.jpg',
      '/placeholder-logo.png',
      '/placeholder-logo.svg',
    ].includes(pathname) || /^\/(?:thread\/)?\d+(?:-[^/]+)?\/feed\.xml$/.test(pathname)
  )
}
