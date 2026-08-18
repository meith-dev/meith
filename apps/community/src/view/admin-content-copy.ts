import type { Translator } from '@meith/i18n'

import { adminSharedCopy } from './admin-copy'
import { copyFor } from './copy'
import { untranslated } from './time'

export function contentAdminCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  const [nameHintLead = '', nameHintMid = '', nameHintTail = ''] = t
    .t('adminContent.directive.nameHint', { block: '\u0000', inline: '\u0000' })
    .split('\u0000')

  return {
    ...adminSharedCopy(t),
    ...copyFor(
      [
        'adminContent.save',
        'adminContent.add',
        'adminContent.added',
        'adminContent.enabled',
        'adminContent.filter.match',
        'adminContent.filter.showInstead',
        'adminContent.filter.showInsteadHint',
        'adminContent.filter.wholeWords',
        'adminContent.filter.active',
        'adminContent.filter.removeThis',
        'adminContent.prefix.label',
        'adminContent.prefix.styleToken',
        'adminContent.prefix.styleTokenHint',
        'adminContent.prefix.displayOrder',
        'adminContent.prefix.onlyBranch',
        'adminContent.prefix.onlyBranchHint',
        'adminContent.prefix.add',
        'adminContent.smiley.code',
        'adminContent.smiley.codePlaceholder',
        'adminContent.smiley.image',
        'adminContent.smiley.imagePlaceholder',
        'adminContent.smiley.altText',
        'adminContent.smiley.altTextHint',
        'adminContent.directive.name',
        'adminContent.directive.namePlaceholder',
        'adminContent.directive.note',
        'adminContent.directive.noteHint',
        'adminContent.directive.block',
        'adminContent.attachment.delete',
        'adminContent.announcement.title',
        'adminContent.announcement.message',
        'adminContent.announcement.messageHint',
        'adminContent.announcement.where',
        'adminContent.announcement.wholeBoard',
        'adminContent.announcement.whereHint',
        'adminContent.announcement.from',
        'adminContent.announcement.until',
        'adminContent.announcement.untilHint',
        'adminContent.announcement.timesUtc',
        'adminContent.captcha.question',
        'adminContent.captcha.questionPlaceholder',
        'adminContent.captcha.answers',
        'adminContent.captcha.answersHint',
      ],
      t,
    ),
    'adminContent.directive.nameHintLead': nameHintLead,
    'adminContent.directive.nameHintMid': nameHintMid,
    'adminContent.directive.nameHintTail': nameHintTail,
  }
}
