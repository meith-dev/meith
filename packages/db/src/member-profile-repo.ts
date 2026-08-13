import { and, eq, ne, sql } from 'drizzle-orm'

import type { MemberProfileRecord, MemberProfileRepository } from '@meith/accounts'

import type { Database } from './client'
import { usergroups, users } from './schema'

export class PostgresMemberProfileRepository implements MemberProfileRepository {
  constructor(private readonly db: Database) {}

  async findPublicById(id: number): Promise<MemberProfileRecord | null> {
    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        title: usergroups.title,
        postCount: users.postCount,
        createdAt: users.createdAt,
        lastActiveAt: users.lastActiveAt,
        location: users.location,
        website: users.website,
        bio: users.bio,
      })
      .from(users)
      .leftJoin(
        usergroups,
        // eslint-disable-next-line no-restricted-properties -- naming the column the board displays by, not deciding access
        eq(usergroups.id, sql`coalesce(${users.displayGroupId}, ${users.primaryGroupId})`),
      )
      .where(and(eq(users.id, id), ne(users.state, 'deleted')))
      .limit(1)

    return rows[0] ?? null
  }
}
