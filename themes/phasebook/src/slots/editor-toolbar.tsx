'use client'

import {
  applyEditorTag,
  applyInsertion,
  type EditorTag,
  type EditorToolbarButtonModel,
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
  'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground'

function runButton(textareaId: string, button: EditorToolbarButtonModel): void {
  const field = document.getElementById(textareaId)
  if (!(field instanceof HTMLTextAreaElement)) return

  if (button.tag !== null) {
    applyEditorTag(field, button.tag, button.placeholder)
    return
  }

  if (button.insertion !== null) applyInsertion(field, button.insertion)
}

function glyphFor(button: EditorToolbarButtonModel): string {
  return button.tag === null ? button.label.charAt(0).toUpperCase() : GLYPHS[button.tag]
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
      {buttons.map((button, index) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: a plugin's button carries no id of its own, so the index disambiguates two sharing a tag or label; the list is server-rendered in order and never reordered on the client
          key={`${button.tag ?? button.label}-${index}`}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runButton(textareaId, button)}
          title={button.title}
          aria-label={button.label}
          {...(button.keyShortcut === null ? {} : { 'aria-keyshortcuts': button.keyShortcut })}
          className={BUTTON}
        >
          <span aria-hidden="true">{glyphFor(button)}</span>
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
