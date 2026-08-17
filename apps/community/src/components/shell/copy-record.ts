export type Copy = Readonly<Record<string, string>>

export function fromCopy(copy: Copy, key: string): string {
  return copy[key] ?? key
}
