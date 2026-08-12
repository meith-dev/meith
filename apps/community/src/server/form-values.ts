export function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

export function trimmedText(form: FormData, name: string): string {
  return text(form, name).trim()
}

export function checkbox(form: FormData, name: string): boolean {
  return form.get(name) !== null
}

export function positiveIntIn(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

export function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  return typeof value === 'string' ? positiveIntIn(value) : null
}
