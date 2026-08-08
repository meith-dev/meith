import 'server-only'

/**
 * F55 — telling the people a new post addresses.
 *
 * Two audiences a post names in its own text: members it @mentions, and
 * members whose words it quotes under a `**name wrote:**` attribution. Both
 * are read back from the stored source by `@meith/markdown`'s extractors —
 * the same parser that renders the post, so a mention inside a code span or
 * a quote can no more notify somebody than it can link to them.
 *
 * Quoting carries no post id on purpose (see `quotePrefill`), so the quoted
 * *author's name* is the whole of what a reply knows — which is also exactly
 * what a notification needs: notifications go to people, not to posts.
 *
 * ## The rules, and where each comes from
 *
 *  - **After the commit, never able to fail it.** The post exists before
 *    anybody is told about it, and a notification store being down must not
 *    eat somebody's reply — the `NotificationService` header's rule, applied
 *    the same way `emitEvent` is: outside the write's try.
 *  - **Only a visible post notifies.** An unapproved post is content nobody
 *    may see yet, and a notification linking to it would 404 for its own
 *    recipient — and confirm to them that a held post exists. The cost is
 *    honest and accepted: a post that clears the moderation queue later
 *    notifies nobody.
 *  - **Permission is checked per recipient, through the Authorizer.** A
 *    mention can name a member who cannot see the community the post is in,
 *    and telling them what the thread is called would leak what `thread.view`
 *    exists to hide. Building an actor per recipient is the cost F60's
 *    message policy already pays, capped the same way.
 *  - **An ignored author notifies nobody who ignores them.** F61's list is a
 *    member saying "I do not want to hear from this person"; a mention is
 *    this person speaking to them. A failed read skips rather than notifies,
 *    because the member cannot see that the check was down.
 */
import { extractMentions, extractQuotedAuthors } from '@meith/markdown'
import { logger } from '@meith/core'

import { getContainer } from './container'
import { notificationService } from './notifications'
import { relationService } from './relations'

/**
 * Names considered per post, quoted authors first.
 *
 * The ceiling F60 puts on a private message's recipient list, for the same
 * reason: each name is an account lookup plus an actor build on the board's
 * hottest write path. A post that mentions thirty people notifies the first
 * ten it addresses; the rest still read as links.
 */
export const MAX_POST_NOTIFICATIONS = 10

/** What the write path knows about the post it just committed. */
export interface NewPostFacts {
  readonly postId: number
  readonly threadId: number
  readonly threadSlug: string
  readonly threadTitle: string
  readonly communityId: number
  readonly authorUserId: number
  readonly authorUsername: string
  /** Markdown source, as stored. */
  readonly message: string
  readonly visibility: 'visible' | 'unapproved'
}

/**
 * Raise `post.quoted` and `post.mentioned` for one new post.
 *
 * Never throws: the post is already committed, so every failure here is
 * logged and swallowed — a lost notification is recoverable by reading the
 * thread, a lost post is not.
 */
export async function notifyMentionsAndQuotes(post: NewPostFacts): Promise<void> {
  try {
    await tell(post)
  } catch (err) {
    logger({ module: 'post-notifications' }).error(
      { err },
      'failed to raise mention/quote notifications',
    )
  }
}

async function tell(post: NewPostFacts): Promise<void> {
  if (post.visibility !== 'visible') return

  const service = notificationService()
  if (service === null) return

  const { foldIdentifier } = await import('@meith/accounts')

  /*
   * One plan per member, quote outranking mention: a reply that quotes
   * somebody and also @mentions them is one event to that person, and "your
   * words were quoted" is the more specific half of it.
   */
  const planned = new Map<string, 'post.quoted' | 'post.mentioned'>()
  for (const name of extractQuotedAuthors(post.message)) {
    planned.set(foldIdentifier(name), 'post.quoted')
  }
  for (const name of extractMentions(post.message)) {
    const folded = foldIdentifier(name)
    if (!planned.has(folded)) planned.set(folded, 'post.mentioned')
  }
  /* Quoting yourself, mentioning yourself: talking is not being talked to. */
  planned.delete(foldIdentifier(post.authorUsername))
  if (planned.size === 0) return

  const { accountStore, actorSource, authorizer } = getContainer()
  const relations = relationService()

  /*
   * Deep-linked to the post itself, the way F56's notifier links a digest:
   * the `after` cursor opens the page the post is on, the anchor lands on it.
   */
  const href =
    `/thread/${post.threadId}-${post.threadSlug}` +
    `${post.postId > 1 ? `?after=${post.postId - 1}` : ''}#post-${post.postId}`

  for (const [usernameLower, kind] of [...planned].slice(0, MAX_POST_NOTIFICATIONS)) {
    const account = await accountStore.accounts.findByUsernameLower(usernameLower)
    /*
     * A name that resolves to nobody is prose — "@ada" on a board with no ada
     * — and the author's own name under a self-quote is covered above by the
     * fold, but not when the account was renamed between quote and submit.
     */
    if (account === null || account.id === post.authorUserId) continue

    /* A member whose actor cannot be built cannot be shown the thread. */
    const actor = await actorSource.buildForUser(account.id)
    if (actor === null) continue

    const scope = {
      communityId: post.communityId,
      community: await authorizer.communityMatrix(actor, post.communityId),
    }
    if (!authorizer.can(actor, 'thread.view', scope)) continue

    if (relations !== null) {
      try {
        if (await relations.ignores(account.id, post.authorUserId)) continue
      } catch {
        /* An ignore that could not be checked must not become a notification. */
        continue
      }
    }

    await service.raise({
      userId: account.id,
      kind,
      /*
       * Who and where — never the text. A notification row outlives the post
       * that caused it (F55), and neither a deleted reply nor a deleted
       * original should survive in somebody's centre.
       */
      data: { byUsername: post.authorUsername, threadTitle: post.threadTitle },
      /*
       * Keyed by the new post, so a retry after a crash between raises is
       * one row per person rather than two. Two posts each quoting somebody
       * are two events and two rows, which is what they are.
       */
      dedupeKey: `${kind}:${post.postId}`,
      href,
    })
  }
}
