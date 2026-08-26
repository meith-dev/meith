import { ConfigurationError } from '@meith/core'

export function unusableKeyReason(key: string): string | undefined {
  if (key === '' || key.trim() !== key) {
    return 'is empty, or has leading or trailing whitespace'
  }
  if (key.startsWith('/') || key.includes('//')) {
    return 'has an empty path segment'
  }
  if (key.split('/').some((segment) => segment === '..' || segment === '.')) {
    return 'has a relative path segment'
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    return 'contains a control character'
  }
  return undefined
}

export function assertUsableKey(key: string): void {
  const reason = unusableKeyReason(key)
  if (reason !== undefined) {
    throw new ConfigurationError(`Unusable object key ${JSON.stringify(key)}: it ${reason}.`)
  }
}

export function encodeKeyPath(key: string): string {
  return key.replace(/[^/]+/g, (segment) => encodeURIComponent(segment))
}
