'use client'

/**
 * F45's BBCode buttons.
 *
 * ## It enhances; it never enables
 *
 * Every tag these insert can be typed by hand, and the textarea below is the
 * feature. That is what lets this be a client component in a board that posts
 * without JavaScript.
 *
 * ## They used to be unstyled
 *
 * Bare `<button>`s, which Tailwind's preflight strips back to plain text — so
 * the toolbar read as the words "Bold Italic Link Quote" floating above the
 * message box rather than as controls anybody would think to press. They carry
 * `buttonVariants` now, the same recipe every other control on the board uses;
 * `ghost` at the small size, because a formatting bar sits above the thing it
 * formats and must not out-weigh it.
 */

import { buttonVariants } from '@meith/ui'

const TAGS = [
  ['b', 'Bold'],
  ['i', 'Italic'],
  ['url', 'Link'],
  ['quote', 'Quote'],
] as const

export function EditorToolbar({ targetId = 'post-message' }: { targetId?: string }) {
  function insert(tag: string) {
    const field = document.getElementById(targetId) as HTMLTextAreaElement | null
    if (field === null) return
    const selected = field.value.slice(field.selectionStart, field.selectionEnd)
    field.setRangeText(
      `[${tag}]${selected}[/${tag}]`,
      field.selectionStart,
      field.selectionEnd,
      'end',
    )
    field.focus()
  }

  return (
    <div
      role="group"
      aria-label="Formatting"
      className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/50 p-1"
    >
      {TAGS.map(([tag, label]) => (
        <button
          key={tag}
          type="button"
          onClick={() => insert(tag)}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
