/**
 * What the composer's buttons and keys do to the text, as pure functions.
 *
 * Extracted from the editor because this is the part that can be *wrong*.
 * Everything else in `markdown-editor.tsx` is wiring — a click handler, a tab,
 * a fetch — and its failures are visible the moment somebody opens the page.
 * The rules below are not: a toggle that reads one asterisk of a `**` pair as
 * italic turns bold into italic on a keystroke, looks plausible in review, and
 * is only caught by somebody who tries it in that order.
 *
 * So they return an **`Edit`** rather than touching a textarea, and the module
 * is a `.ts` with a test beside it. The component's only job is to apply one.
 */

/** A replacement, and where the caret goes after it. */
export interface Edit {
  /** Replace `[from, to)` with `text`. */
  readonly from: number
  readonly to: number
  readonly text: string
  readonly selectionStart: number
  readonly selectionEnd: number
}

export interface WrapSyntax {
  /** The delimiter character. One character; the run length is `length`. */
  readonly marker: string
  /** `1` for emphasis, `2` for strong and strikethrough. */
  readonly length: number
  /** Inserted and selected when there is nothing to wrap. */
  readonly placeholder: string
}

/** A marker put at the start of every selected line. */
export type LineMarker = string | ((index: number) => string)

/** A list marker at the start of a line, for Return-continues-the-list. */
const CONTINUES = /^(\s*)(?:([-*+])[ \t]+(\[[ xX]\][ \t]+)?|(\d{1,9})([.)])[ \t]+|(>)[ ]?)/

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i

/** The line range containing `[start, end)`. */
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

/**
 * Wrap the selection, or unwrap it if it is already wrapped.
 *
 * The toggle **counts the delimiter run** on each side rather than comparing
 * strings, and that is what makes Bold and Italic compose instead of fighting
 * over the same character:
 *
 *   - Emphasis looks for an **odd** run. `*x*` is italic; `**x**` is not, so
 *     pressing Italic inside bold adds a level and gives `***x***` rather than
 *     stealing one of bold's asterisks.
 *   - Strong looks for a run of **two or more**. `***x***` is bold *and*
 *     italic, so pressing Bold there takes two away and leaves `*x*`.
 *
 * A string comparison gets both of those wrong in the same direction: it sees
 * the innermost asterisk of `**x**`, calls it italic, and turns bold into
 * italic on a keystroke that was meant to add to it.
 */
export function toggleWrap(
  value: string,
  start: number,
  end: number,
  syntax: WrapSyntax,
): Edit {
  const { marker, length, placeholder } = syntax
  const rail = marker.repeat(length)
  const selected = value.slice(start, end)

  /*
   * The selection may carry its own markers — double-clicking a bolded word
   * selects `**word**` in some browsers. Stripping them makes the button an off
   * switch there too, rather than producing `****word****`.
   */
  if (selected.length > length * 2 && selected.startsWith(rail) && selected.endsWith(rail)) {
    const inner = selected.slice(length, -length)
    return { from: start, to: end, text: inner, selectionStart: start, selectionEnd: start + inner.length }
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

/**
 * Put a marker at the start of every selected line, or take it off.
 *
 * Whole lines, always: a quote or a list item is a property of a line, and
 * marking from the middle of one produces `some te> xt`.
 */
export function togglePrefix(value: string, start: number, end: number, marker: LineMarker): Edit {
  const { from, to } = lineRange(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const markerFor = (index: number): string =>
    typeof marker === 'string' ? marker : marker(index)

  /* Every line already marked means the button removes it. */
  const marked = lines.every((line, index) => line.startsWith(markerFor(index)))
  const text = lines
    .map((line, index) => (marked ? line.slice(markerFor(index).length) : `${markerFor(index)}${line}`))
    .join('\n')

  return { from, to, text, selectionStart: from, selectionEnd: from + text.length }
}

/**
 * A link built around whatever is selected.
 *
 * A selected URL becomes the destination and the caret lands on the label;
 * selected words become the label and the caret lands on the destination. Both
 * put the caret on the part the author still has to write.
 */
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

/** A fenced block around the selected lines. Fenced, never indented (D101). */
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

/**
 * What Return should do on a list or quote line, or `null` for "the usual".
 *
 * On an item with nothing in it Return **ends** the list rather than adding
 * another empty one — the behaviour every editor that does this has settled on,
 * and the reason the feature is not infuriating.
 */
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
  /* A finished task carries on as an unfinished one; nobody continues a tick. */
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

/**
 * A URL pasted over a selection becomes a link around it.
 *
 * `null` when the paste is not a bare URL or there is nothing selected, which
 * is the overwhelmingly common case and must behave like an ordinary paste.
 */
export function pasteAsLink(value: string, start: number, end: number, pasted: string): Edit | null {
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
