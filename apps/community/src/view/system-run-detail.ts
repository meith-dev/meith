export interface RunDetailField {
  readonly path: readonly string[]
  readonly value: string | number | boolean | null
}

export function systemRunDetail(detail: string | null): readonly RunDetailField[] {
  if (detail === null || detail.trim() === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(detail)
  } catch {
    return [{ path: [], value: detail }]
  }

  const fields: RunDetailField[] = []
  const pending = [{ path: [] as string[], value: parsed }]
  while (pending.length > 0) {
    const { path, value } = pending.pop()!
    if (value !== null && typeof value === 'object') {
      const entries = Array.isArray(value)
        ? value.map((item, index) => [String(index + 1), item] as const)
        : Object.entries(value)
      if (entries.length === 0) fields.push({ path, value: null })
      for (const [key, item] of entries.reverse()) {
        pending.push({ path: [...path, key], value: item })
      }
    } else {
      fields.push({ path, value: value as RunDetailField['value'] })
    }
  }
  return fields
}
