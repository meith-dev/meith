import type { Translator } from '@meith/i18n'

import { adminSharedCopy } from './admin-copy'
import { copyFor, patternCopy } from './copy'
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
        'adminNavigation.inside',
        'adminNavigation.topLevel',
        'adminNavigation.audience',
        'adminNavigation.groups',
        'adminNavigation.groupsHint',
        'adminNavigation.newTab',
        'adminNavigation.shown',
        'adminNavigation.removeThis',
        'adminNavigation.builtIn',
        'adminNavigation.custom',
        'adminNavigation.hidden',
        'adminNavigation.tree.heading',
        'adminNavigation.tree.dragHint',
        'adminNavigation.tree.arrowsHint',
        'adminNavigation.tree.help',
        'adminNavigation.tree.where.topLevel',
        'adminNavigation.tree.order.first',
        ...Object.values(NAVIGATION_AUDIENCE_MESSAGE_KEYS),
      ],
      t,
    ),
    ...patternCopy(
      [
        'adminNavigation.tree.edit',
        'adminNavigation.tree.moveHandle',
        'adminNavigation.tree.placed',
        'adminNavigation.tree.where.under',
        'adminNavigation.tree.order.after',
        'adminNavigation.tree.nudge.up',
        'adminNavigation.tree.nudge.down',
        'adminNavigation.tree.nudge.in',
        'adminNavigation.tree.nudge.out',
      ],
      t,
    ),
  }
}
