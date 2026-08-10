import 'server-only'

import { foldIdentifier } from '@meith/accounts'
import { logger } from '@meith/core'
import { extractMentions, extractQuotedAuthors, vocabularyOptions } from '@meith/markdown'

import { postAnchor } from '@/view/post-anchor'

import { activeVocabulary } from './content-admin'
import { getContainer } from './container'
import { notificationService } from './notifications'

const MAX_RECIPIENTS_PER_KIND = 10

export interface NewPostNotice {
  readonly postId: number
  readonly threadId: number
  readonly threadSlug: string
  readonly threadTitle: string
  readonly message: string
  readonly authorUsername: string
  readonly visibility: 'visible' | 'unapproved'
}

export async function notifyPostAudience(notice: NewPostNotice): Promise<void> {
  try {
    const service = notificationService()
    if (service === null) return
    if (notice.visibility !== 'visible') return

    const options = vocabularyOptions(await activeVocabulary())
    const quoted = extractQuotedAuthors(notice.message, options)
    const mentioned = extractMentions(notice.message, options)

    const href = `/thread/${notice.threadId}-${notice.threadSlug}#${postAnchor(notice.postId)}`
    const data = { byUsername: notice.authorUsername, threadTitle: notice.threadTitle }

    const { accountStore } = getContainer()
    const told = new Set<string>([foldIdentifier(notice.authorUsername)])

    for (const [kind, names] of [
      ['post.quoted', quoted],
      ['post.mentioned', mentioned],
    ] as const) {
      let raised = 0
      for (const name of names) {
        if (raised >= MAX_RECIPIENTS_PER_KIND) break
        const folded = foldIdentifier(name)
        if (told.has(folded)) continue
        told.add(folded)

        const account = await accountStore.accounts.findByUsernameLower(folded)
        if (account === null) continue

        await service.raise({
          userId: account.id,
          kind,
          data,
          href,
          dedupeKey: `${kind}:${notice.postId}`,
        })
        raised += 1
      }
    }
  } catch (err) {
    logger({ module: 'post-notifications' }).error(
      { err, postId: notice.postId },
      'failed to raise mention/quote notifications',
    )
  }
}
