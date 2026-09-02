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
  image: 'Image',
  quote: '“”',
  code: '</>',
  spoiler: 'Spoiler',
  bulletedList: '•',
  numberedList: '1.',
  taskList: '☑',
  heading: 'H',
  table: 'Table',
}

const BUTTON =
  'min-w-8 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

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
      className="flex flex-wrap gap-0.5 border-b border-border bg-muted/40 p-2"
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
