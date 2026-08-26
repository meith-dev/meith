export function normaliseOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function isUsableIssuer(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(normaliseOrigin(value))
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return parsed.hostname !== '' && parsed.search === '' && parsed.hash === ''
}

export function isUsableFeedUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()
  const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback)
}

export function isUsableOrigin(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(normaliseOrigin(value))
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.hostname === '') return false
  return (
    (parsed.pathname === '' || parsed.pathname === '/') &&
    parsed.search === '' &&
    parsed.hash === ''
  )
}
