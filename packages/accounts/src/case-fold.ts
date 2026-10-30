export function foldIdentifier(value: string): string {
  return value.trim().toLowerCase()
}

export function foldSecurityIdentifier(value: string): string {
  return foldIdentifier(value.normalize('NFKC'))
}
