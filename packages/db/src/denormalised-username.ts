import { sql } from 'drizzle-orm'

import type { Tx } from './permission-version'

export interface DenormalisedUsernameColumn {
  readonly table: string
  readonly column: string
  readonly idColumn: string
}

export const DENORMALISED_USERNAME_COLUMNS: readonly DenormalisedUsernameColumn[] = [
  { table: 'forums', column: 'last_post_username', idColumn: 'last_post_user_id' },
  { table: 'threads', column: 'last_post_username', idColumn: 'last_post_user_id' },
  { table: 'threads', column: 'author_username', idColumn: 'author_user_id' },
  { table: 'posts', column: 'author_username', idColumn: 'author_user_id' },
  { table: 'private_messages', column: 'author_username', idColumn: 'author_user_id' },
  { table: 'announcements', column: 'author_username', idColumn: 'author_user_id' },
  { table: 'board_stats', column: 'newest_username', idColumn: 'newest_user_id' },
]

export async function rewriteDenormalisedUsernames(
  tx: Tx,
  userId: number,
  username: string,
): Promise<void> {
  for (const entry of DENORMALISED_USERNAME_COLUMNS) {
    await tx.execute(sql`
      update ${sql.raw(entry.table)}
         set ${sql.raw(entry.column)} = ${username}
       where ${sql.raw(entry.idColumn)} = ${userId}
         and ${sql.raw(entry.column)} is distinct from ${username}
    `)
  }
}
