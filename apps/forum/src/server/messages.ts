import 'server-only'

/**
 * F60 — the app's one way to reach the message service.
 *
 * Three things live here: the service, the **policy** that answers "may they
 * receive, and how many may they keep", and the **notifier** that turns F60's
 * two-verb port into F55 raises.
 *
 * The policy is the interesting one. `@forum/messages` deliberately knows
 * nothing about groups (F20), so the two questions it cannot answer are asked
 * here, through the Authorizer and nothing else — `pm.use` for the boolean and
 * `globalLimit` for the number. Neither is read off the actor directly, which
 * is the rule that keeps every permission answer inside one package.
 */
import { MessageService, type MessageNotifierPort, type MessagePolicy } from '@forum/messages'

import { getContainer } from './container'
import { notificationService } from './notifications'

/**
 * The service, or `null` on a board with no message store (fixture mode).
 *
 * Callers branch on the null rather than getting a no-op service: "this board
 * has no private messages" is a fact the screens must show, and a mailbox that
 * silently drops every send looks exactly like one nobody has written to.
 */
export function messageService(): MessageService | null {
  const { messages } = getContainer()
  if (messages === null) return null

  return new MessageService({
    messages,
    policy: messagePolicy(),
    notifier: messageNotifier(),
  })
}

/**
 * Who may receive a message, and how many they may keep.
 *
 * Building an actor per recipient is the same cost F56's notifier pays per
 * subscriber, and for the same reason: the answer depends on that member's
 * groups, and there is exactly one place on this board allowed to work that
 * out. A send goes to at most ten people, so the ceiling is ten actor builds
 * on an action a member takes by hand.
 *
 * A member whose actor cannot be built — deleted between the lookup and the
 * send — **cannot receive**. Failing closed is the only safe direction when the
 * question is "should this person get this".
 */
export function messagePolicy(): MessagePolicy {
  const { accountStore, actorSource, authorizer } = getContainer()

  return {
    async lookup(username) {
      const { foldIdentifier } = await import('@forum/accounts')
      const account = await accountStore.accounts.findByUsernameLower(
        foldIdentifier(username),
      )
      /*
       * A banned account is still a recipient — being unable to reply is not
       * the same as being unaddressable, and a moderator explaining a ban by
       * message is exactly the case. `limitsFor` below is what refuses anybody
       * who genuinely cannot receive, and it fails closed.
       */
      if (account === null) return null
      return { id: account.id, username: account.username }
    },

    async limitsFor(userId) {
      const actor = await actorSource.buildForUser(userId)
      if (actor === null) return { quota: 0, canReceive: false }

      return {
        canReceive: authorizer.can(actor, 'pm.use'),
        quota: authorizer.globalLimit(actor, 'privateMessageQuota'),
      }
    },
  }
}

/**
 * F60's port, as F55 raises.
 *
 * Neither kind carries the message body. A notification row outlives the thing
 * that caused it, so carrying it would leave a copy of a deleted private
 * message in the centre — and in an e-mail the member may have declined for
 * messages themselves.
 */
export function messageNotifier(): MessageNotifierPort | null {
  const service = notificationService()
  if (service === null) return null

  return {
    async messageReceived(input) {
      await service.raise({
        userId: input.userId,
        kind: 'pm.received',
        data: { fromUsername: input.fromUsername, subject: input.subject },
        /*
         * No dedupe key. Two messages are two messages, and coalescing them
         * would hide the second — which on this kind is somebody being written
         * to twice, not one event repeating.
         */
        href: `/messages/${input.messageId}`,
      })
    },

    async receiptRead(input) {
      await service.raise({
        userId: input.userId,
        kind: 'pm.receipt',
        data: { byUsername: input.byUsername, subject: input.subject },
        /*
         * Keyed by message, so an announcement to five people who all open it
         * is one unread line with a count rather than five. Which of them read
         * it is on the message's own tracking list.
         */
        dedupeKey: `pm.receipt:${input.messageId}`,
        href: `/messages/${input.messageId}`,
      })
    },
  }
}

/**
 * The unread badge in the user panel (F27's `UserPanelModel.unreadMessages`).
 *
 * A field the theme contract has carried since F27 with nothing to fill it.
 * Counted on every page render for every signed-in member, which is why the
 * migration gives it a partial index over unread inbox rows only.
 *
 * Never throws: the shell renders the error pages too, and a message count is
 * not worth failing a page over.
 */
export async function unreadMessageCount(userId: number | null): Promise<number> {
  if (userId === null) return 0
  const service = messageService()
  if (service === null) return 0

  try {
    return (await service.counts(userId)).unread
  } catch {
    return 0
  }
}
