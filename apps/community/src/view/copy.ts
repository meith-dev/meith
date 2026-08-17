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

export function formChromeCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(['form.working', 'form.notSaved'], t)
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
