import { and, eq, ne } from 'drizzle-orm'

import type { PluginUserRef, PluginUsers } from '@meith/plugin-kit'

import type { Database } from './client'
import { users } from './schema'

const REF = { userId: users.id, username: users.username } as const

/**
 * The host's implementation of the kit's `PluginUsers`: id and public name,
 * nothing else, deleted accounts excluded. A banned or unactivated member
 * still resolves — whether to sell to one is the plugin's decision to make
 * with its own rules, not something to silently pre-decide here.
 */
export function pluginUsers(db: Database): PluginUsers {
  const first = (rows: readonly PluginUserRef[]): PluginUserRef | null => rows[0] ?? null

  return {
    async byUsername(username) {
      const needle = username.trim().toLowerCase()
      if (needle === '') return null

      return first(
        await db
          .select(REF)
          .from(users)
          .where(and(eq(users.usernameLower, needle), ne(users.state, 'deleted')))
          .limit(1),
      )
    },

    async byId(userId) {
      if (!Number.isSafeInteger(userId) || userId <= 0) return null

      return first(
        await db
          .select(REF)
          .from(users)
          .where(and(eq(users.id, userId), ne(users.state, 'deleted')))
          .limit(1),
      )
    },
  }
}
