export function encodeCursor(at: Date, id: number): string {
  return Buffer.from(`${at.toISOString()}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(value: string): { at: Date; id: number } | null {
  try {
    const [at, id] = Buffer.from(value, 'base64url').toString('utf8').split('|')
    if (at === undefined || id === undefined) return null
    const when = new Date(at)
    const numeric = Number(id)
    if (Number.isNaN(when.getTime()) || !Number.isSafeInteger(numeric)) return null
    return { at: when, id: numeric }
  } catch {
    return null
  }
}
