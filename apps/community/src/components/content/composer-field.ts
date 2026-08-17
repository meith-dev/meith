'use client'

export function composerField(): HTMLTextAreaElement | null {
  const field = document.getElementById('post-message')
  return field instanceof HTMLTextAreaElement ? field : null
}

export function insertQuotes(
  field: HTMLTextAreaElement,
  quotes: readonly string[],
  { reveal }: { reveal: boolean },
): void {
  if (quotes.length === 0) return

  const existing = field.value.replace(/\s+$/, '')
  field.value = `${existing === '' ? '' : `${existing}\n\n`}${quotes.join('\n\n')}\n\n`

  if (reveal) {
    const panel = field.closest('details')
    if (panel !== null) panel.open = true
  }

  field.setSelectionRange(field.value.length, field.value.length)

  if (reveal) {
    field.focus()
    field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  field.dispatchEvent(new Event('input', { bubbles: true }))
}
