import { DEFAULT_LIMITS } from './limits'

// biome-ignore lint/suspicious/noControlCharactersInRegex: URL smuggling relies on exactly these
const FORBIDDEN = /[\u0000-\u0020\u007f"'<>`\\{}|^]/

const ABSOLUTE = /^https?:\/\/[^/]/i
const MAILTO = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i

export interface UrlPolicy {
  readonly maxLength?: number
  readonly allowMailto?: boolean
}

export function safeUrl(value: string, policy: UrlPolicy = {}): string | null {
  const url = value.trim()
  const maxLength = policy.maxLength ?? DEFAULT_LIMITS.maxUrlLength

  if (url.length === 0 || url.length > maxLength) return null
  if (FORBIDDEN.test(url)) return null

  if (ABSOLUTE.test(url)) return url
  if (policy.allowMailto === true && MAILTO.test(url)) return url

  if (url.startsWith('/') && !url.startsWith('//')) return url

  return null
}

export function safeImageUrl(value: string): string | null {
  return safeUrl(value)
}
