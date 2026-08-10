export function escapeMarkdownText(value: string): string {
  return value
    .replace(/([\\`*_[\]<>|~])/g, '\\$1')
    .split('\n')
    .map((line) => line.replace(/^(\s*)(:::|[#>+=-]|\d+[.)])/, '$1\\$2'))
    .join('\n')
}

export function plainAuthorName(name: string): string {
  return name.replace(/[*[\]`\\]/g, '').trim()
}
