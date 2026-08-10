export function normaliseOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '')
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
