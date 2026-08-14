import 'server-only'

export function isSafeLocalPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false

  for (const character of path) {
    const code = character.charCodeAt(0)
    if (code <= 0x20 || code === 0x7f || character === '\\') return false
  }

  try {
    return new URL(path, 'http://localhost').origin === 'http://localhost'
  } catch {
    return false
  }
}
