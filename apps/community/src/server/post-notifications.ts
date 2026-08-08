import 'server-only'

/**
 * F55 — telling the people a new post speaks to.
 *
 * Two kinds are raised here and nowhere else: `post.mentioned` for every
 * `@name` the body renders as a mention, and `post.quoted` for every author a
 * top-level `> **name wrote:**` block attributes. Both are read back off the
 * parsed body (`@meith/markdown`'s `extractMentions` / `extractQuotedAuthors`)
 * rather than carried through the composer, so the form, the API and a member
 * who typed the shape by hand all count the same — the rule is "what the post
 * says", not "which button was pressed".
 *
 * The service header's rule applies: a notification is a consequence of an
 * act, not part of it. This runs after the post's transaction has committed,
 * and **nothing in this module may throw** — a reply that posted and then
 * failed to notify is a missing notification, not a failed reply.
 *
 * Two silences are deliberate:
 *
 *  - An **unapproved** post notifies nobody. Its link would 404 for every
 *    recipient, and a moderator may yet reject it — in which case the
 *    notification would be the only place the board ever showed it existed.
 *    A post approved out of the queue does not notify either; that is the
 *    price of the queue being invisible, recorded here so it reads as a
 *    decision rather than an oversight.
 *  - **Edits** notify nobody. An edit that adds `@name` re-raises nothing,
 *    because the alternative — re-parsing on every edit and diffing who was
 *    already told — buys a rare convenience with a common repetition.
 */
import { foldIdentifier } from '@meith/accounts'
import { logger } from '@meith/core'
import { extractMentions, extractQuotedAuthors, vocabularyOptions } from '@meith/markdown'

import { activeVocabulary } from './content-admin'
import { getContainer } from './container'
import { notificationService } from './notifications'

/**
 * The most people one post notifies, per kind.
 *
 * A ceiling in the spirit of `MAX_STAFF_FANOUT`: the eleventh name in a
 * roll-call post is a write and a mail the first ten already made pointless,
 * and without a ceiling a single post is a notification for every member whose
 * name its author cared to type. First-appearance order decides who is inside
 * it.
 */
const MAX_RECIPIENTS_PER_KIND = 10

export interface NewPostNotice {
  readonly postId: number
  readonly threadId: number
  readonly threadSlug: string
  readonly threadTitle: string
  /** The raw Markdown body, exactly as it was written. */
  readonly message: string
  /**
   * The author's display name. Identity enough here: `username_lower` is
   * unique, so folding it excludes the author from their own audience without
   * carrying the id this module would otherwise never read.
   */
  readonly authorUsername: string
  readonly visibility: 'visible' | 'unapproved'
}

/**
 * Raise `post.quoted` and `post.mentioned` for one committed post.
 *
 * Quoted wins the overlap: quoting somebody usually *also* names them in the
 * attribution line, and a member told "you were quoted" has been told
 * everything "you were mentioned" would add. Nobody is notified twice, and the
 * author never notifies themself — quoting your own earlier post is editing at
 * a distance, not news.
 */
export async function notifyPostAudience(notice: NewPostNotice): Promise<void> {
  try {
    const service = notificationService()
    if (service === null) return
    if (notice.visibility !== 'visible') return

    /* The same parse options the render uses, so this agrees with the page. */
    const options = vocabularyOptions(await activeVocabulary())
    const quoted = extractQuotedAuthors(notice.message, options)
    const mentioned = extractMentions(notice.message, options)

    /* The post's permalink — the shape `thread-view.ts` gives every post. */
    const href = `/thread/${notice.threadId}-${notice.threadSlug}#post-${notice.postId}`
    const data = { byUsername: notice.authorUsername, threadTitle: notice.threadTitle }

    const { accountStore } = getContainer()
    /* Folded, because `@Wren` and a row holding `wren` are the same person. */
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

        /*
         * A name nobody holds notifies nobody — silently, because the author
         * already posted; there is no form left to warn on. Banned and
         * suspended accounts still receive: being unable to post is not the
         * same as being unaddressable, the line `messagePolicy` draws.
         */
        const account = await accountStore.accounts.findByUsernameLower(folded)
        if (account === null) continue

        await service.raise({
          userId: account.id,
          kind,
          data,
          href,
          /*
           * Keyed by post, so a raise retried by a future caller coalesces
           * rather than doubling. Two different posts are two rows — being
           * quoted twice is two things that happened.
           */
          dedupeKey: `${kind}:${notice.postId}`,
        })
        raised += 1
      }
    }
  } catch (err) {
    /* See the header: the post exists; failing it now would un-ring no bell. */
    logger({ module: 'post-notifications' }).error(
      { err, postId: notice.postId },
      'failed to raise mention/quote notifications',
    )
  }
}
