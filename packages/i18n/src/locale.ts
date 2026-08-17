export type Locale = string

export const SOURCE_LOCALE = 'en'

const TAG = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?$/

export function normaliseLocale(value: string | null | undefined): Locale | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '*') return null

  const parts = trimmed.toLowerCase().split(/[-_]/)
  const language = parts[0]
  if (language === undefined) return null

  const rest = parts
    .slice(1)
    .map((part) =>
      part.length === 4
        ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
        : part.length === 2
          ? part.toUpperCase()
          : part,
    )

  const tag = [language, ...rest].join('-')
  return TAG.test(tag.toLowerCase()) ? tag : null
}

export function localeChain(locale: Locale): readonly Locale[] {
  const parts = locale.split('-')
  const chain: Locale[] = []

  for (let length = parts.length; length > 0; length -= 1) {
    chain.push(parts.slice(0, length).join('-'))
  }

  return chain
}

export interface AcceptedLocale {
  readonly locale: Locale
  readonly quality: number
}

export function parseAcceptLanguage(header: string | null | undefined): readonly AcceptedLocale[] {
  if (typeof header !== 'string') return []

  const accepted: AcceptedLocale[] = []

  for (const entry of header.split(',')) {
    const [tag, ...parameters] = entry.split(';')
    const locale = normaliseLocale(tag)
    if (locale === null) continue

    const quality = parameters.reduce((carried, parameter) => {
      const match = /^\s*q\s*=\s*([\d.]+)\s*$/.exec(parameter)
      if (match?.[1] === undefined) return carried
      const parsed = Number.parseFloat(match[1])
      return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : carried
    }, 1)

    if (quality > 0) accepted.push({ locale, quality })
  }

  return accepted
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.quality - a.entry.quality || a.index - b.index)
    .map(({ entry }) => entry)
}

export function negotiateLocale(input: {
  readonly requested: readonly (Locale | null | undefined)[]
  readonly supported: readonly Locale[]
  readonly fallback: Locale
}): Locale {
  const supported = new Map(input.supported.map((locale) => [locale.toLowerCase(), locale]))

  for (const candidate of input.requested) {
    const locale = normaliseLocale(candidate)
    if (locale === null) continue

    for (const step of localeChain(locale)) {
      const match = supported.get(step.toLowerCase())
      if (match !== undefined) return match
    }

    const prefix = `${locale.split('-')[0]?.toLowerCase() ?? ''}-`
    for (const [key, value] of supported) {
      if (key.startsWith(prefix)) return value
    }
  }

  return supported.get(input.fallback.toLowerCase()) ?? input.fallback
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  const language = locale.split('-')[0]?.toLowerCase() ?? ''
  return RIGHT_TO_LEFT.has(language) ? 'rtl' : 'ltr'
}

const RIGHT_TO_LEFT = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'ku',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
])
