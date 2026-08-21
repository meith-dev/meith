'use client'

import {
  applyEditorTag,
  type EditorTag,
  type EditorToolbarModel,
  type SlotCopy,
} from '@meith/theme-kit'

const GLYPHS: Readonly<Record<EditorTag, string>> = {
  bold: 'B',
  italic: 'I',
  strikethrough: 'S',
  link: 'Link',
  quote: '“”',
  code: '</>',
  spoiler: 'Spoiler',
  bulletedList: '•',
  numberedList: '1.',
  heading: 'H',
}

const BUTTON =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground'

function runTag(textareaId: string, tag: EditorTag, placeholder: string | null): void {
  const field = document.getElementById(textareaId)
  if (field instanceof HTMLTextAreaElement) applyEditorTag(field, tag, placeholder)
}

export function EditorToolbar({
  textareaId,
  groupLabel,
  buttons,
  attachment,
}: EditorToolbarModel & { copy: SlotCopy }) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      className="flex flex-wrap gap-1 border-b border-border bg-secondary/40 px-3 py-2"
    >
      {buttons.map((button) => (
        <button
          key={button.tag}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTag(textareaId, button.tag, button.placeholder)}
          title={button.title}
          aria-label={button.label}
          {...(button.keyShortcut === null ? {} : { 'aria-keyshortcuts': button.keyShortcut })}
          className={BUTTON}
        >
          <span aria-hidden="true">{GLYPHS[button.tag]}</span>
        </button>
      ))}

      {attachment !== null && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => document.getElementById(attachment.inputId)?.click()}
          title={attachment.label}
          aria-label={attachment.label}
          className={BUTTON}
        >
          <span aria-hidden="true">{attachment.label}</span>
        </button>
      )}
    </div>
  )
}
