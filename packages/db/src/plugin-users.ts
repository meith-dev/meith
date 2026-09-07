import { and, asc, eq, gt, inArray, ne } from 'drizzle-orm'

import type { PluginUserRef, PluginUsers } from '@meith/plugin-kit'

import type { Database } from './client'
import { users } from './schema'

const REF = { userId: users.id, username: users.username } as const
const STANDING = {
  ...REF,
  postCount: users.postCount,
  threadCount: users.threadCount,
  reputation: users.reputation,
  registeredAt: users.createdAt,
} as const

export function pluginUsers(db: Database): PluginUsers {
  const first = (rows: readonly PluginUserRef[]): PluginUserRef | null => rows[0] ?? null

  return {
    async standing(userIds) {
      if (userIds.length > 200) throw new RangeError('plugin_standing_limit_200')
      if (userIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        throw new RangeError('plugin_standing_positive_ids_required')
      }
      if (userIds.length === 0) return []
      return db
        .select(STANDING)
        .from(users)
        .where(and(inArray(users.id, [...userIds]), ne(users.state, 'deleted')))
        .orderBy(asc(users.id))
        .limit(200)
    },

    async scan({ afterUserId, limit }) {
      if (!Number.isSafeInteger(afterUserId) || afterUserId < 0 || !Number.isFinite(limit)) {
        throw new RangeError('plugin_scan_nonnegative_cursor_finite_limit_required')
      }
      return db
        .select(STANDING)
        .from(users)
        .where(and(gt(users.id, afterUserId), ne(users.state, 'deleted')))
        .orderBy(asc(users.id))
        .limit(Math.max(0, Math.min(200, Math.floor(limit))))
    },

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
