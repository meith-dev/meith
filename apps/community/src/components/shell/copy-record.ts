import { formatMessage, type MessageArgs } from '@meith/i18n'

export type Copy = Readonly<Record<string, string>>

export function fromCopy(copy: Copy, key: string): string {
  return copy[key] ?? key
}

export function formatFromCopy(copy: Copy, key: string, args: MessageArgs): string {
  const pattern = copy[key]
  if (pattern === undefined) return key

  const locale = typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en'

  try {
    return formatMessage(pattern, args, { locale, timeZone: 'UTC' })
  } catch {
    return pattern
  }
}
