import type { Translator } from '@meith/i18n'

import { copyFor, patternCopy, splitAround } from './copy'
import { untranslated } from './time'

export function replyFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'composer.draftSaved',
      'composer.autosave.failed',
      'composer.autosave.saved',
      'composer.autosave.saving',
      'composer.recovery.available',
      'composer.recovery.discard',
      'composer.recovery.restore',
      'composer.notifyReplies',
      'composer.reply.submit',
      'composer.reply.write',
      'composer.reply.quick',
      'composer.reply.draftSaved',
    ],
    t,
  )
}

export function editPostFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'composer.edit.reason',
      'composer.edit.submit',
      'composer.edit.delete',
      'composer.edit.deleteBlurb',
      'composer.edit.restore',
      'composer.edit.restoreBlurb',
      'composer.preview',
    ],
    t,
  )
}

export function newThreadFormCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'composer.draftSaved',
        'composer.notifyReplies',
        'composer.newThread.subject',
        'composer.newThread.prefix',
        'composer.newThread.prefixOptional',
        'composer.newThread.choosePrefix',
        'composer.newThread.noPrefix',
        'composer.newThread.addPoll',
        'composer.newThread.optional',
        'composer.newThread.question',
        'composer.newThread.submit',
      ],
      t,
    ),
    ...patternCopy(['composer.newThread.option'], t),
  }
}

export function messageFormsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'messageForm.to',
      'messageForm.toHint',
      'messageForm.bcc',
      'messageForm.bccHint',
      'messageForm.subject',
      'messageForm.bodyHint',
      'messageForm.receipt',
      'messageForm.send',
      'messageForm.withSelected',
      'messageForm.markRead',
      'messageForm.markUnread',
      'messageForm.restore',
      'messageForm.deleteForever',
      'messageForm.emptyTrash',
      'messageForm.moveToTrash',
    ],
    t,
  )
}

export function threadRatingCopy(
  rating: { readonly count: number; readonly average: number; readonly mine: number | null },
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  const [outOfLead, outOfTail] = splitAround(t, 'thread.rating.outOf', 'average')
  return {
    ...copyFor(
      [
        'thread.rating.section',
        'thread.rating.none',
        'thread.rating.rateIt',
        'thread.rating.yours',
      ],
      t,
    ),
    ...patternCopy(['thread.rating.rateValue', 'thread.rating.currentValue'], t),
    'thread.rating.outOfLead': outOfLead,
    'thread.rating.outOfTail': outOfTail,
    'thread.rating.average': t.number(rating.average, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    'thread.rating.from': t.t('thread.rating.from', { count: rating.count }),
    'thread.rating.countLabel': t.t('thread.rating.countLabel', { count: rating.count }),
    'thread.rating.mine': t.t('thread.rating.mine', { value: rating.mine ?? 0 }),
  }
}
