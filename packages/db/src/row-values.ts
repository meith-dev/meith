export function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}

export function toNullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value)
}
