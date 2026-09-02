import { sql } from 'drizzle-orm'

import type { BoardDigestCadence, BoardDigestRepository, EligibleMember } from '@meith/board-digest'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate } from './row-values'

export class PostgresBoardDigestRepository implements BoardDigestRepository {
  constructor(private readonly db: Database) {}

  async dueMembers(input: {
    readonly cadence: BoardDigestCadence
    readonly dueBefore: Date
    readonly lapsedBefore: Date
    readonly limit: number
  }): Promise<readonly EligibleMember[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select u.id as user_id, u.last_active_at
          from users u
          join notification_preferences p
                 on p.user_id = u.id and p.kind = 'board.digest' and p.email = true
         where u.state = 'active'
           and u.board_digest_cadence = ${input.cadence}
           and u.last_active_at is not null
           and u.last_active_at < ${input.lapsedBefore}
           and (u.board_digest_sent_at is null or u.board_digest_sent_at < ${input.dueBefore})
         order by u.id
         limit ${input.limit}
      `),
    ) as Array<{ user_id: number; last_active_at: string | Date }>

    return rows.map((row) => ({
      userId: Number(row.user_id),
      lastActiveAt: toDate(row.last_active_at),
    }))
  }

  async recordDigestRun(input: { readonly userId: number; readonly at: Date }): Promise<void> {
    await this.db.execute(sql`
      update users set board_digest_sent_at = ${input.at} where id = ${input.userId}
    `)
  }
}
