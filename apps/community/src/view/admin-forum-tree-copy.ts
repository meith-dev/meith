import type { Translator } from '@meith/i18n'

import { copyFor, patternCopy } from './copy'
import { untranslated } from './time'

export function forumTreeCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'adminForum.options',
        'adminForum.tree.heading',
        'adminForum.tree.dragHint',
        'adminForum.tree.arrowsHint',
        'adminForum.tree.help',
        'adminForum.tree.where.topLevel',
        'adminForum.tree.order.first',
        'adminForum.tree.type.forum',
        'adminForum.tree.type.category',
        'adminForum.tree.type.link',
        'adminForum.tree.permissions',
      ],
      t,
    ),
    ...patternCopy(
      [
        'adminForum.tree.moveHandle',
        'adminForum.tree.nudge.up',
        'adminForum.tree.nudge.down',
        'adminForum.tree.nudge.in',
        'adminForum.tree.nudge.out',
        'adminForum.tree.where.inside',
        'adminForum.tree.order.after',
        'adminForum.tree.placed',
        'adminForum.tree.optionsFor',
        'adminForum.tree.permissionsFor',
      ],
      t,
    ),
  }
}
