'use client'

import {
  applyEditorTag,
  applyInsertion,
  type EditorTag,
  type EditorToolbarButtonModel,
  type EditorToolbarModel,
  type SlotCopy,
} from '@meith/theme-kit'

import { RULE } from '../shared'

const GLYPHS: Readonly<Record<EditorTag, string>> = {
  bold: 'B',
  italic: 'I',
  strikethrough: 'S',
  link: 'LINK',
  image: 'IMG',
  quote: 'QUOTE',
  code: 'CODE',
  spoiler: 'SPLR',
  bulletedList: 'UL',
  numberedList: 'OL',
  taskList: 'TASK',
  heading: 'H',
  table: 'TBL',
}

const BUTTON =
  'inline-flex min-w-8 items-center justify-center border border-border bg-secondary px-2 py-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-secondary-foreground hover:border-primary/70 hover:text-primary'

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
    <>
      <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-1 px-4 py-3">
        {buttons.map((button) => (
          <button
            key={button.label}
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
      <div className={RULE} aria-hidden="true" />
    </>
  )
}
