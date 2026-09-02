'use client'

import {
  applyEditorTag,
  type EditorTag,
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
    <>
      <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-1 px-4 py-3">
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
      <div className={RULE} aria-hidden="true" />
    </>
  )
}
