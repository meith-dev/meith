import type { Translator } from '@meith/i18n'

import { untranslated } from './time'

export function copyFor(
  keys: readonly string[],
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function patternCopy(
  keys: readonly string[],
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.pattern(key) ?? key
  return copy
}

const CHROME_KEYS = [
  'form.working',
  'form.notSaved',
  'confirm.confirm',
  'confirm.cancel',
  'confirm.heading',
  'notice.dismiss',
  'composer.message',
  'composer.tabs',
  'composer.write',
  'composer.preview',
  'composer.formatting',
  'composer.rendering',
  'composer.previewFailed',
  'composer.previewEmpty',
  'composer.saveDraft',
  'composer.tool.bold',
  'composer.tool.italic',
  'composer.tool.strikethrough',
  'composer.tool.link',
  'composer.tool.image',
  'composer.tool.quote',
  'composer.tool.code',
  'composer.tool.bulletedList',
  'composer.tool.numberedList',
  'composer.tool.taskList',
  'composer.tool.heading',
  'composer.tool.table',
  'composer.tool.spoiler',
  'composer.tool.attachment',
  'composer.placeholder.bold',
  'composer.placeholder.italic',
  'composer.placeholder.struck',
  'composer.placeholder.spoiler',
  'composer.placeholder.image',
  'composer.placeholder.table',
  'composer.help.summary',
  'composer.help.bold',
  'composer.help.italic',
  'composer.help.struck',
  'composer.help.link',
  'composer.help.image',
  'composer.help.codeInline',
  'composer.help.codeBlock',
  'composer.help.quote',
  'composer.help.list',
  'composer.help.taskList',
  'composer.help.heading',
  'composer.help.table',
  'composer.help.note',
  'composer.help.spoiler',
  'composer.help.mention',
  'composer.help.attachment',
  'composer.attachments.label',
  'composer.mention.suggestions',
  'composer.attachment.uploading',
  'composer.thanks.thanked',
  'composer.thanks.thanks',
  'composer.multiquote.button',
  'composer.multiquote.tooltip',
  'composer.multiquote.addToReply',
  'composer.multiquote.adding',
  'composer.multiquote.clear',
  'composer.multiquote.cleared',
  'composer.multiquote.noneQuoted',
] as const

const CHROME_PATTERN_KEYS = [
  'composer.toolShortcut',
  'composer.attachments.hint',
  'composer.thanks.count',
  'composer.multiquote.selectedToQuote',
  'composer.multiquote.added',
  'composer.multiquote.removed',
  'composer.multiquote.quotesAdded',
  'composer.multiquote.quotesPartial',
] as const

export function formChromeCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return { ...copyFor(CHROME_KEYS, t), ...patternCopy(CHROME_PATTERN_KEYS, t) }
}

export function splitAround(
  t: Translator,
  key: string,
  slot: string,
  args?: Readonly<Record<string, string | number>>,
): readonly [string, string] {
  const rendered = t.t(key, { ...args, [slot]: '\u0000' })
  const at = rendered.indexOf('\u0000')
  return at === -1 ? [rendered, ''] : [rendered.slice(0, at), rendered.slice(at + 1)]
}
