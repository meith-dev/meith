'use client'

const TAGS = [['b', 'Bold'], ['i', 'Italic'], ['url', 'Link'], ['quote', 'Quote']] as const

export function EditorToolbar({ targetId = 'post-message' }: { targetId?: string }) {
  function insert(tag: string) {
    const field = document.getElementById(targetId) as HTMLTextAreaElement | null
    if (field === null) return
    const selected = field.value.slice(field.selectionStart, field.selectionEnd)
    field.setRangeText(`[${tag}]${selected}[/${tag}]`, field.selectionStart, field.selectionEnd, 'end')
    field.focus()
  }
  return <div className="flex gap-2" aria-label="Formatting toolbar">{TAGS.map(([tag, label]) => <button key={tag} type="button" onClick={() => insert(tag)}>{label}</button>)}</div>
}
