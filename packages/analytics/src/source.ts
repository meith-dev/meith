export const DIRECT_SOURCE = 'direct'

export const INTERNAL_SOURCE = 'internal'

export const MAX_SOURCE_LENGTH = 80

const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/

function hostOf(referrer: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(referrer)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host.length > MAX_SOURCE_LENGTH || !HOST.test(host)) return null

  return host
}

export function viewSource(input: {
  readonly referrer: string | null | undefined
  readonly boardHost: string | null | undefined
}): string {
  const referrer = (input.referrer ?? '').trim()
  if (referrer === '') return DIRECT_SOURCE

  const host = hostOf(referrer)
  if (host === null) return DIRECT_SOURCE

  const board = (input.boardHost ?? '').toLowerCase().replace(/^www\./, '')
  if (board !== '' && (host === board || host.endsWith(`.${board}`))) {
    return INTERNAL_SOURCE
  }

  return host
}

export function isExternalSource(source: string): boolean {
  return source !== DIRECT_SOURCE && source !== INTERNAL_SOURCE
}
