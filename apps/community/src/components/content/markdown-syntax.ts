import { type Edit, lineRange } from '@meith/theme-kit'

const CONTINUES = /^(\s*)(?:([-*+])[ \t]+(\[[ xX]\][ \t]+)?|(\d{1,9})([.)])[ \t]+|(>)[ ]?)/

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i

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
