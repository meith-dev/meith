import type { Translator } from '@meith/i18n'
import type { EditorTag, EditorToolbarButtonModel, EditorToolbarModel } from '@meith/theme-kit'

import { attachmentFieldId, MESSAGE_TEXTAREA_ID } from '@/components/content/composer-ids'

import { untranslated } from './time'

interface ToolSpec {
  readonly tag: EditorTag
  readonly key: string
  readonly shortcut: string | null
  readonly placeholderKey: string | null
}

const TOOLS: readonly ToolSpec[] = [
  {
    tag: 'bold',
    key: 'composer.tool.bold',
    shortcut: 'b',
    placeholderKey: 'composer.placeholder.bold',
  },
  {
    tag: 'italic',
    key: 'composer.tool.italic',
    shortcut: 'i',
    placeholderKey: 'composer.placeholder.italic',
  },
  {
    tag: 'strikethrough',
    key: 'composer.tool.strikethrough',
    shortcut: null,
    placeholderKey: 'composer.placeholder.struck',
  },
  { tag: 'link', key: 'composer.tool.link', shortcut: 'k', placeholderKey: null },
  {
    tag: 'image',
    key: 'composer.tool.image',
    shortcut: null,
    placeholderKey: 'composer.placeholder.image',
  },
  { tag: 'quote', key: 'composer.tool.quote', shortcut: null, placeholderKey: null },
  { tag: 'code', key: 'composer.tool.code', shortcut: null, placeholderKey: null },
  {
    tag: 'spoiler',
    key: 'composer.tool.spoiler',
    shortcut: null,
    placeholderKey: 'composer.placeholder.spoiler',
  },
  { tag: 'bulletedList', key: 'composer.tool.bulletedList', shortcut: null, placeholderKey: null },
  { tag: 'numberedList', key: 'composer.tool.numberedList', shortcut: null, placeholderKey: null },
  { tag: 'taskList', key: 'composer.tool.taskList', shortcut: null, placeholderKey: null },
  { tag: 'heading', key: 'composer.tool.heading', shortcut: null, placeholderKey: null },
  {
    tag: 'table',
    key: 'composer.tool.table',
    shortcut: null,
    placeholderKey: 'composer.placeholder.table',
  },
]

function button(spec: ToolSpec, t: Translator): EditorToolbarButtonModel {
  const label = t.t(spec.key)
  return {
    tag: spec.tag,
    insertion: null,
    label,
    icon: null,
    title:
      spec.shortcut === null
        ? label
        : t.t('composer.toolShortcut', { label, key: spec.shortcut.toUpperCase() }),
    keyShortcut: spec.shortcut === null ? null : `Control+${spec.shortcut}`,
    placeholder: spec.placeholderKey === null ? null : t.t(spec.placeholderKey),
  }
}

export interface EditorToolbarInput {
  readonly textareaId?: string
  readonly attachments?: boolean
  readonly t?: Translator
}

export function buildEditorToolbarModel(input: EditorToolbarInput = {}): EditorToolbarModel {
  const t = input.t ?? untranslated()
  const textareaId = input.textareaId ?? MESSAGE_TEXTAREA_ID

  return {
    textareaId,
    groupLabel: t.t('composer.formatting'),
    buttons: TOOLS.map((spec) => button(spec, t)),
    attachment:
      input.attachments === true
        ? { inputId: attachmentFieldId(textareaId), label: t.t('composer.tool.attachment') }
        : null,
    previewAction: null,
  }
}
