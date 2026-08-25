import { ConfigurationError } from '@meith/core'

export function assertUsableKey(key: string): void {
  if (key === '' || key.trim() !== key) {
    throw new ConfigurationError(`Invalid object key: ${JSON.stringify(key)}`)
  }
  if (key.startsWith('/') || key.includes('//')) {
    throw new ConfigurationError(`Object key must not contain empty segments: ${key}`)
  }
  if (key.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new ConfigurationError(`Object key must not contain relative segments: ${key}`)
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    throw new ConfigurationError('Object key must not contain control characters.')
  }
}

export function encodeKeyPath(key: string): string {
  return key.replace(/[^/]+/g, (segment) => encodeURIComponent(segment))
}
