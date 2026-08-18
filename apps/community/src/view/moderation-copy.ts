import type { Translator } from '@meith/i18n'

import { copyFor, patternCopy, splitAround } from './copy'
import { untranslated } from './time'

export function moderationFormsCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  const [byLead, byTail] = splitAround(t, 'moderationForm.queue.by', 'author')
  return {
    ...copyFor(
      [
        'moderationForm.queue.approve',
        'moderationForm.queue.reject',
        'moderationForm.report.label',
        'moderationForm.report.hint',
        'moderationForm.report.submit',
        'moderationForm.report.putBack',
        'moderationForm.report.take',
        'moderationForm.report.note',
        'moderationForm.report.resolve',
        'moderationForm.report.dismiss',
        'moderationForm.inline.withThreads',
        'moderationForm.inline.withPosts',
        'moderationForm.inline.moderateThreads',
        'moderationForm.inline.moderatePosts',
        'moderationForm.inline.approve',
        'moderationForm.inline.restore',
        'moderationForm.inline.splitTitleSr',
        'moderationForm.inline.splitOut',
        'moderationForm.inline.delete',
        'moderationForm.newThreadTitle',
        'moderationForm.moveTo',
        'moderationForm.tool.lock',
        'moderationForm.tool.unlock',
        'moderationForm.tool.pin',
        'moderationForm.tool.unpin',
        'moderationForm.tool.move',
        'moderationForm.tool.copy',
        'moderationForm.tool.deleteThread',
        'moderationForm.lock.why',
        'moderationForm.lock.signature',
        'moderationForm.lock.unlockSignature',
        'moderationForm.lock.avatar',
        'moderationForm.lock.unlockAvatar',
        'moderationForm.surgery.fromSr',
        'moderationForm.surgery.titleSr',
        'moderationForm.surgery.split',
        'moderationForm.surgery.mergeSr',
        'moderationForm.surgery.mergePlaceholder',
        'moderationForm.surgery.merge',
        'moderationForm.warn.revokeSr',
        'moderationForm.warn.revokePlaceholder',
        'moderationForm.warn.revoke',
      ],
      t,
    ),
    ...patternCopy(['moderationForm.queue.inForum', 'moderationForm.surgery.splitPoint'], t),
    'moderationForm.queue.byLead': byLead,
    'moderationForm.queue.byTail': byTail,
  }
}

export function issueWarningFormCopy(
  username: string,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'moderationForm.warn.reason',
        'moderationForm.warn.somethingElse',
        'moderationForm.warn.titleLabel',
        'moderationForm.warn.titleHint',
        'moderationForm.warn.points',
        'moderationForm.warn.what',
        'moderationForm.warn.submit',
      ],
      t,
    ),
    'moderationForm.warn.title': t.t('moderationForm.warn.title', { username }),
    'moderationForm.warn.whatHint': t.t('moderationForm.warn.whatHint', { username }),
  }
}
