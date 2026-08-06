export function resultRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]

  if (
    typeof result === 'object' &&
    result !== null &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }

  return []
}
