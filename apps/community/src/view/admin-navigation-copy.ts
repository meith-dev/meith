import type { Translator } from '@meith/i18n'

import { adminSharedCopy } from './admin-copy'
import { copyFor } from './copy'
import { NAVIGATION_AUDIENCE_MESSAGE_KEYS } from './navigation'
import { untranslated } from './time'

export function navigationAdminCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...adminSharedCopy(t),
    ...copyFor(
      [
        'adminContent.save',
        'adminContent.add',
        'adminContent.added',
        'adminNavigation.label',
        'adminNavigation.labelHint',
        'adminNavigation.address',
        'adminNavigation.addressHint',
        'adminNavigation.displayOrder',
        'adminNavigation.audience',
        'adminNavigation.groups',
        'adminNavigation.groupsHint',
        'adminNavigation.newTab',
        'adminNavigation.shown',
        'adminNavigation.removeThis',
        ...Object.values(NAVIGATION_AUDIENCE_MESSAGE_KEYS),
      ],
      t,
    ),
  }
}
