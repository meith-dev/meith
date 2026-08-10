export function formatSender(address: string, name?: string): string {
  const cleaned = stripControlCharacters(name ?? '').trim()
  if (cleaned === '') return address

  const escaped = cleaned.replace(/([\\"])/g, '\\$1')
  return `"${escaped}" <${address}>`
}

function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is this function's job
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
}
