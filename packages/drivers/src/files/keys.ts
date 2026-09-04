import { ConfigurationError, unusableKeyReason } from '@meith/core'

export { unusableKeyReason }

export function assertUsableKey(key: string): void {
  const reason = unusableKeyReason(key)
  if (reason !== undefined) {
    throw new ConfigurationError(`Unusable object key ${JSON.stringify(key)}: it ${reason}.`)
  }
}

export function encodeKeyPath(key: string): string {
  return key.replace(/[^/]+/g, (segment) => encodeURIComponent(segment))
}
