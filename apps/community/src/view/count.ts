import type { Translator } from '@meith/i18n'
import type { CountModel } from '@meith/theme-kit'

import { untranslated } from './time'

export function count(value: number, translator: Translator = untranslated()): CountModel {
  return { value, label: translator.number(value) }
}
