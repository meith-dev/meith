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

const CONTINUES = /^(\s*)(?:([-*+])[ \t]+(\[[ xX]\][ \t]+)?|(\d{1,9})([.)])[ \t]+|(>)[ ]?)/

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

export function listContinuation(value: string, caret: number): Edit | null {
  const { from } = lineRange(value, caret, caret)
  const line = value.slice(from, caret)
  const match = CONTINUES.exec(line)
  if (match === null) return null

  const marker = match[0]
  if (line.length === marker.length) {
    return { from, to: caret, text: '', selectionStart: from, selectionEnd: from }
  }

  const indent = match[1] ?? ''
  const ordered = match[4]
  const task = match[3] === undefined ? '' : '[ ] '
  const next =
    ordered === undefined
      ? `${marker.slice(0, marker.length - (match[3]?.length ?? 0))}${task}`
      : `${indent}${Number(ordered) + 1}${match[5] ?? '.'} `

  return {
    from: caret,
    to: caret,
    text: `\n${next}`,
    selectionStart: caret + next.length + 1,
    selectionEnd: caret + next.length + 1,
  }
}

export function pasteAsLink(
  value: string,
  start: number,
  end: number,
  pasted: string,
): Edit | null {
  const url = pasted.trim()
  if (start === end || !URL_ONLY.test(url)) return null

  const label = value.slice(start, end)
  const text = `[${label}](${url})`
  return {
    from: start,
    to: end,
    text,
    selectionStart: start + text.length,
    selectionEnd: start + text.length,
  }
}
