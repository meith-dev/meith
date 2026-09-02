export interface Edit {
  readonly from: number
  readonly to: number
  readonly text: string
  readonly selectionStart: number
  readonly selectionEnd: number
}

export interface WrapSyntax {
  readonly marker: string
  readonly length: number
  readonly placeholder: string
}

export type LineMarker = string | ((index: number) => string)

export type EditorTag =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'link'
  | 'image'
  | 'quote'
  | 'code'
  | 'spoiler'
  | 'bulletedList'
  | 'numberedList'
  | 'taskList'
  | 'heading'
  | 'table'

export type EditorInsertion =
  | { readonly kind: 'wrap'; readonly before: string; readonly after: string }
  | { readonly kind: 'block'; readonly text: string }

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i

export function lineRange(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end)
  return { from, to: lineEnd === -1 ? value.length : lineEnd }
}

function runBefore(value: string, at: number, marker: string): number {
  let count = 0
  while (at - count - 1 >= 0 && value[at - count - 1] === marker) count += 1
  return count
}

function runAfter(value: string, at: number, marker: string): number {
  let count = 0
  while (at + count < value.length && value[at + count] === marker) count += 1
  return count
}

export function toggleWrap(value: string, start: number, end: number, syntax: WrapSyntax): Edit {
  const { marker, length, placeholder } = syntax
  const rail = marker.repeat(length)
  const selected = value.slice(start, end)

  if (selected.length > length * 2 && selected.startsWith(rail) && selected.endsWith(rail)) {
    const inner = selected.slice(length, -length)
    return {
      from: start,
      to: end,
      text: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    }
  }

  const outside = Math.min(runBefore(value, start, marker), runAfter(value, end, marker))
  const wrapped = length === 1 ? outside % 2 === 1 : outside >= length

  if (wrapped) {
    return {
      from: start - length,
      to: end + length,
      text: selected,
      selectionStart: start - length,
      selectionEnd: end - length,
    }
  }

  const body = selected === '' ? placeholder : selected
  return {
    from: start,
    to: end,
    text: `${rail}${body}${rail}`,
    selectionStart: start + length,
    selectionEnd: start + length + body.length,
  }
}

export function togglePrefix(value: string, start: number, end: number, marker: LineMarker): Edit {
  const { from, to } = lineRange(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const markerFor = (index: number): string => (typeof marker === 'string' ? marker : marker(index))

  const marked = lines.every((line, index) => line.startsWith(markerFor(index)))
  const text = lines
    .map((line, index) =>
      marked ? line.slice(markerFor(index).length) : `${markerFor(index)}${line}`,
    )
    .join('\n')

  return { from, to, text, selectionStart: from, selectionEnd: from + text.length }
}

export function linkEdit(value: string, start: number, end: number): Edit {
  const selected = value.slice(start, end)

  if (URL_ONLY.test(selected)) {
    const label = 'link text'
    return {
      from: start,
      to: end,
      text: `[${label}](${selected})`,
      selectionStart: start + 1,
      selectionEnd: start + 1 + label.length,
    }
  }

  const label = selected === '' ? 'link text' : selected
  return {
    from: start,
    to: end,
    text: `[${label}](url)`,
    selectionStart: start + label.length + 3,
    selectionEnd: start + label.length + 6,
  }
}

export function fenceEdit(value: string, start: number, end: number): Edit {
  const { from, to } = lineRange(value, start, end)
  const body = value.slice(from, to)
  const lead = from === 0 ? '' : '\n'
  const content = body === '' ? 'code' : body
  const caret = from + lead.length + 4

  return {
    from,
    to,
    text: `${lead}\`\`\`\n${content}\n\`\`\``,
    selectionStart: caret,
    selectionEnd: caret + content.length,
  }
}

export function spoilerEdit(value: string, start: number, end: number, placeholder: string): Edit {
  const { from, to } = lineRange(value, start, end)
  const body = value.slice(from, to)
  const lead = from === 0 ? '' : '\n'
  const content = body === '' ? placeholder : body
  const caret = from + lead.length + ':::spoiler\n'.length

  return {
    from,
    to,
    text: `${lead}:::spoiler\n${content}\n:::`,
    selectionStart: caret,
    selectionEnd: caret + content.length,
  }
}

export function imageEdit(value: string, start: number, end: number, placeholder: string): Edit {
  const selected = value.slice(start, end)
  const alt = selected === '' ? placeholder : selected
  const text = `![${alt}](url)`
  const caret = start + alt.length + 4

  return { from: start, to: end, text, selectionStart: caret, selectionEnd: caret + 3 }
}

export function tableEdit(value: string, start: number, end: number, placeholder: string): Edit {
  const lead = start === 0 || value[start - 1] === '\n' ? '' : '\n'
  const tail = end === value.length || value[end] === '\n' ? '' : '\n'
  const text = `${lead}| ${placeholder} | ${placeholder} |\n| --- | --- |\n|  |  |${tail}`
  const caret = start + lead.length + 2

  return {
    from: start,
    to: end,
    text,
    selectionStart: caret,
    selectionEnd: caret + placeholder.length,
  }
}

export function wrapInsertionEdit(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
): Edit {
  const selected = value.slice(start, end)

  return {
    from: start,
    to: end,
    text: `${before}${selected}${after}`,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  }
}

export function blockInsertionEdit(value: string, start: number, end: number, text: string): Edit {
  const lead = start === 0 || value[start - 1] === '\n' ? '' : '\n'
  const tail = end === value.length || value[end] === '\n' ? '' : '\n'
  const body = `${lead}${text}${tail}`
  const caret = start + body.length

  return { from: start, to: end, text: body, selectionStart: caret, selectionEnd: caret }
}

const WRAP_TAGS: Readonly<
  Record<'bold' | 'italic' | 'strikethrough', { marker: string; length: number }>
> = {
  bold: { marker: '*', length: 2 },
  italic: { marker: '*', length: 1 },
  strikethrough: { marker: '~', length: 2 },
}

const PREFIX_TAGS: Readonly<
  Record<'quote' | 'bulletedList' | 'numberedList' | 'taskList' | 'heading', LineMarker>
> = {
  quote: '> ',
  bulletedList: '- ',
  numberedList: (index: number) => `${index + 1}. `,
  taskList: '- [ ] ',
  heading: '## ',
}

export function applyEditorEdit(field: HTMLTextAreaElement, edit: Edit): void {
  field.setRangeText(edit.text, edit.from, edit.to, 'end')
  field.setSelectionRange(edit.selectionStart, edit.selectionEnd)
  field.focus()
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

export function applyEditorTag(
  field: HTMLTextAreaElement,
  tag: EditorTag,
  placeholder: string | null,
): void {
  const { value, selectionStart: start, selectionEnd: end } = field

  if (tag === 'bold' || tag === 'italic' || tag === 'strikethrough') {
    const { marker, length } = WRAP_TAGS[tag]
    applyEditorEdit(
      field,
      toggleWrap(value, start, end, { marker, length, placeholder: placeholder ?? '' }),
    )
    return
  }

  if (
    tag === 'quote' ||
    tag === 'bulletedList' ||
    tag === 'numberedList' ||
    tag === 'taskList' ||
    tag === 'heading'
  ) {
    applyEditorEdit(field, togglePrefix(value, start, end, PREFIX_TAGS[tag]))
    return
  }

  if (tag === 'link') {
    applyEditorEdit(field, linkEdit(value, start, end))
    return
  }

  if (tag === 'image') {
    applyEditorEdit(field, imageEdit(value, start, end, placeholder ?? ''))
    return
  }

  if (tag === 'code') {
    applyEditorEdit(field, fenceEdit(value, start, end))
    return
  }

  if (tag === 'table') {
    applyEditorEdit(field, tableEdit(value, start, end, placeholder ?? ''))
    return
  }

  applyEditorEdit(field, spoilerEdit(value, start, end, placeholder ?? ''))
}

export function applyInsertion(field: HTMLTextAreaElement, insertion: EditorInsertion): void {
  const { value, selectionStart: start, selectionEnd: end } = field

  if (insertion.kind === 'wrap') {
    applyEditorEdit(field, wrapInsertionEdit(value, start, end, insertion.before, insertion.after))
    return
  }

  applyEditorEdit(field, blockInsertionEdit(value, start, end, insertion.text))
}
