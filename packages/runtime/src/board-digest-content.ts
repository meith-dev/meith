import type { Actor, ActorSource, Authorizer } from '@meith/authorization'
import type { BoardDigestContentSource } from '@meith/board-digest'
import { contentScopeFrom, logger } from '@meith/core'
import type { DiscoveryScope, PostgresDiscoveryRepository } from '@meith/db'

export function boardDigestContentSource(deps: {
  readonly authorizer: Authorizer
  readonly actors: ActorSource
  readonly discovery: PostgresDiscoveryRepository
}): BoardDigestContentSource {
  const log = logger({ module: 'board-digest' })

  return {
    async threadsActiveSince(userId, since, limit) {
      try {
        const actor = await deps.actors.buildForUser(userId)
        if (actor === null) return []

        const scope = await scopeFor(deps.authorizer, actor)
        const page = await deps.discovery.activeSince(since, { limit, after: null }, scope)

        return page.rows.map((row) => ({
          threadId: row.threadId,
          title: row.title,
          href: `/thread/${row.threadId}-${row.slug}`,
          forumTitle: row.forumTitle,
          replyCount: row.replyCount,
          lastAuthor: row.lastPostUsername,
        }))
      } catch (err) {
        log.warn({ err, userId }, 'could not resolve board-digest content for a member')
        return []
      }
    },
  }
}

async function scopeFor(authorizer: Authorizer, actor: Actor): Promise<DiscoveryScope> {
  const staff = actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    ...(await authorizer.threadAudience(actor)),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}
