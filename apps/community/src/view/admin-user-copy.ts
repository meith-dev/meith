import type { Translator } from '@meith/i18n'

import { adminSharedCopy } from './admin-copy'
import { copyFor, patternCopy } from './copy'
import { untranslated } from './time'

export function userAdminCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...adminSharedCopy(t),
    ...copyFor(
      [
        'adminUser.username',
        'adminUser.email',
        'adminUser.emailHint',
        'adminUser.primaryGroup',
        'adminUser.primaryGroupHint',
        'adminUser.displayGroup',
        'adminUser.sameAsPrimary',
        'adminUser.displayGroupHint',
        'adminUser.saveAccount',
        'adminUser.accountState',
        'adminUser.state.active',
        'adminUser.state.awaitingActivation',
        'adminUser.accountStateHint',
        'adminUser.saveState',
        'adminUser.banned',
        'adminUser.banLength',
        'adminUser.banLengthHint',
        'adminUser.staffNote',
        'adminUser.staffNoteHint',
        'adminUser.publicReason',
        'adminUser.publicReasonHint',
        'adminUser.banMember',
        'adminUser.banPasswordNote',
        'adminUser.additionalGroupsSr',
        'adminUser.saveGroups',
        'adminUser.moveNextBatch',
        'adminUser.lifted',
        'adminUser.liftBan',
        'adminUser.prunePasswordNote',
        'adminUser.sendTo',
        'adminUser.sendToHint',
        'adminUser.subject',
        'adminUser.message',
        'adminUser.messageHint',
        'adminUser.queueMessage',
        'adminUser.mailPasswordNote',
        'adminUser.queueNextBatch',
      ],
      t,
    ),
    ...patternCopy(
      [
        'adminUser.primaryGroupRow',
        'adminUser.merged',
        'adminUser.mergeMore',
        'adminUser.mergeInto',
        'adminUser.mergeNote',
        'adminUser.pruneFinished',
        'adminUser.pruneMore',
        'adminUser.mailQueuedAll',
        'adminUser.mailQueuedMore',
      ],
      t,
    ),
  }
}

export function userPruneCopy(
  total: number,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...userAdminCopy(t),
    'adminUser.pruneClose':
      total > 500
        ? t.t('adminUser.pruneCloseFirst500')
        : t.t('adminUser.pruneCloseCount', { count: total }),
  }
}

export function userMassMailCopy(
  audience: number,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...userAdminCopy(t),
    'adminUser.everyMember': t.t('adminUser.everyMember', { audience }),
  }
}
