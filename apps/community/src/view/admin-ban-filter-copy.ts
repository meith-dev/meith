import type { Translator } from '@meith/i18n'

import { adminSharedCopy } from './admin-copy'
import { copyFor, patternCopy } from './copy'
import { untranslated } from './time'

export const BAN_FILTER_TYPE_KEY = {
  username: 'adminBanFilters.type.username',
  email: 'adminBanFilters.type.email',
  ip: 'adminBanFilters.type.ip',
} as const

export function banFilterAdminCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...adminSharedCopy(t),
    ...copyFor(
      [
        'adminBanFilter.type',
        'adminBanFilter.typeHint',
        'adminBanFilter.pattern',
        'adminBanFilter.patternHint',
        'adminBanFilter.patternPlaceholder',
        'adminBanFilter.note',
        'adminBanFilter.noteHint',
        'adminBanFilter.addFilter',
        'adminBanFilter.added',
      ],
      t,
    ),
    ...patternCopy(['adminBanFilter.removeFilter'], t),
  }
}
