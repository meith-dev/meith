import { type SQL, sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { Database } from './client'
import { withPermissionVersionBump } from './permission-version'
import { resultRows } from './result-rows'
import { isStaffGroupSql } from './staff-groups'
import { BANNED_PREDICATE } from './user-admin-repo'
import { ACCOUNT_CLOSURE_DISCARD } from './user-merge-map'

export interface PruneCriteria {
  readonly registeredBefore: Date
  readonly inactiveSince?: Date | undefined
  readonly onlyAwaitingActivation?: boolean | undefined
}

export interface PruneCandidate {
  readonly id: number
  readonly username: string
  readonly email: string
  readonly createdAt: Date
}

export interface PrunePreview {
  readonly total: number
  readonly sample: readonly PruneCandidate[]
}

export interface PruneChunkResult {
  readonly pruned: number
  readonly prunedUserIds: readonly number[]
  readonly remaining: number
}

export interface MassMailRow {
  readonly id: number
  readonly subject: string
  readonly body: string
  readonly targetGroupId: number | null
  readonly lastUserId: number
  readonly queuedCount: number
  readonly status: string
}

export interface MassMailRecipient {
  readonly userId: number
  readonly email: string
  readonly username: string
}

export interface MassMailChunk {
  readonly recipients: readonly MassMailRecipient[]
  readonly finished: boolean
}

export class PostgresUserBulkRepository {
  constructor(private readonly db: Database) {}

  private pruneWhere(criteria: PruneCriteria): SQL {
    const conditions: SQL[] = [
      sql`u.deleted_at is null`,
      sql`u.created_at < ${criteria.registeredBefore}`,
      sql`u.post_count = 0`,
      sql`u.thread_count = 0`,
      sql`not exists (select 1 from posts p where p.author_user_id = u.id)`,
      sql`not exists (select 1 from threads t where t.author_user_id = u.id)`,
      sql`not ${BANNED_PREDICATE}`,
      sql`not exists (
        select 1 from usergroups g
         where g.id = u.primary_group_id and (${isStaffGroupSql('g')})
      )`,
      sql`not exists (
        select 1 from user_group_memberships m
          join usergroups g on g.id = m.group_id
         where m.user_id = u.id and (${isStaffGroupSql('g')})
      )`,
      sql`not exists (select 1 from forum_moderators f where f.user_id = u.id)`,
    ]

    if (criteria.inactiveSince !== undefined) {
      conditions.push(
        sql`(u.last_active_at is null or u.last_active_at < ${criteria.inactiveSince})`,
      )
    }
    if (criteria.onlyAwaitingActivation === true) {
      conditions.push(sql`u.state = 'awaiting_activation'`)
    }

    return sql.join(conditions, sql` and `)
  }

  async prunePreview(criteria: PruneCriteria, sampleSize = 10): Promise<PrunePreview> {
    const where = this.pruneWhere(criteria)

    const totals = resultRows(
      await this.db.execute(sql`select count(*)::int as n from users u where ${where}`),
    ) as Array<{ n: number }>

    const sample = resultRows(
      await this.db.execute(sql`
        select u.id, u.username, u.email, u.created_at
          from users u
         where ${where}
         order by u.id
         limit ${sampleSize}
      `),
    ) as Array<Record<string, unknown>>

    return {
      total: Number(totals[0]?.n ?? 0),
      sample: sample.map((row) => ({
        id: Number(row.id),
        username: String(row.username),
        email: String(row.email),
        createdAt:
          row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
      })),
    }
  }

  async pruneChunk(criteria: PruneCriteria, limit: number): Promise<PruneChunkResult> {
    const where = this.pruneWhere(criteria)

    const pruned = await withPermissionVersionBump(this.db, async (tx) => {
      const candidates = resultRows(
        await tx.execute(sql`
          select u.id
            from users u
           where ${where}
           order by u.id
           limit ${limit}
             for update
        `),
      ) as Array<{ id: number }>
      const userIds = candidates.map((row) => Number(row.id))
      if (userIds.length === 0) return []

      const idList = sql.join(
        userIds.map((id) => sql`${id}`),
        sql`, `,
      )
      for (const entry of ACCOUNT_CLOSURE_DISCARD) {
        await tx.execute(sql`
          delete from ${sql.raw(entry.table)}
           where ${sql.raw(entry.column)} in (${idList})
        `)
      }

      await tx.execute(sql`
        update remember_tokens
           set revoked_at = now(), revoked_reason = 'account_closure'
         where user_id in (${idList}) and revoked_at is null
      `)

      await tx.execute(sql`
        update sessions
           set revoked_at = now()
         where user_id in (${idList}) and revoked_at is null
      `)

      const rows = resultRows(
        await tx.execute(sql`
          update users
             set deleted_at = now(), updated_at = now()
           where id in (${idList})
          returning id
        `),
      ) as Array<{ id: number }>
      return rows.map((row) => Number(row.id))
    })

    const remaining = resultRows(
      await this.db.execute(sql`select count(*)::int as n from users u where ${where}`),
    ) as Array<{ n: number }>

    return {
      pruned: pruned.length,
      prunedUserIds: pruned,
      remaining: Number(remaining[0]?.n ?? 0),
    }
  }

  async selectedPrunePreview(userIds: readonly number[]): Promise<PrunePreview> {
    if (userIds.length === 0) return { total: 0, sample: [] }
    const idList = sql.join(userIds.map((id) => sql`${id}`), sql`, `)
    const rows = resultRows(
      await this.db.execute(sql`
        select u.id, u.username, u.email, u.created_at
          from users u
         where u.id in (${idList})
           and u.deleted_at is null
           and u.post_count = 0
           and u.thread_count = 0
           and not exists (select 1 from posts p where p.author_user_id = u.id)
           and not exists (select 1 from threads t where t.author_user_id = u.id)
           and not ${BANNED_PREDICATE}
           and not exists (
             select 1 from usergroups g
              where g.id = u.primary_group_id and (${isStaffGroupSql('g')})
           )
           and not exists (
             select 1 from user_group_memberships m
               join usergroups g on g.id = m.group_id
              where m.user_id = u.id and (${isStaffGroupSql('g')})
           )
           and not exists (select 1 from forum_moderators f where f.user_id = u.id)
         order by u.id
      `),
    ) as Array<Record<string, unknown>>

    const sample = rows.map((row) => ({
      id: Number(row.id),
      username: String(row.username),
      email: String(row.email),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    }))
    return { total: sample.length, sample }
  }

  async pruneSelected(userIds: readonly number[]): Promise<readonly number[]> {
    const eligible = await this.selectedPrunePreview(userIds)
    const ids = eligible.sample.map((row) => row.id)
    if (ids.length === 0) return []
    const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `)

    return withPermissionVersionBump(this.db, async (tx) => {
      for (const entry of ACCOUNT_CLOSURE_DISCARD) {
        await tx.execute(sql`
          delete from ${sql.raw(entry.table)} where ${sql.raw(entry.column)} in (${idList})
        `)
      }
      await tx.execute(sql`
        update remember_tokens set revoked_at = now(), revoked_reason = 'account_closure'
         where user_id in (${idList}) and revoked_at is null
      `)
      await tx.execute(sql`
        update sessions set revoked_at = now()
         where user_id in (${idList}) and revoked_at is null
      `)
      const rows = resultRows(
        await tx.execute(sql`
          update users set deleted_at = now(), updated_at = now()
           where id in (${idList}) and deleted_at is null returning id
        `),
      ) as Array<{ id: number }>
      return rows.map((row) => Number(row.id))
    })
  }

  async createMassMail(input: {
    readonly subject: string
    readonly body: string
    readonly targetGroupId: number | null
    readonly createdByUserId: number | null
  }): Promise<number> {
    if (input.subject.trim() === '')
      throw new ValidationError(msg('error.db.message-needs-subject'))
    if (input.body.trim() === '') throw new ValidationError(msg('error.db.message-needs-body'))

    const rows = resultRows(
      await this.db.execute(sql`
        insert into mass_mails (subject, body, target_group_id, created_by_user_id)
        values (${input.subject.trim()}, ${input.body.trim()},
                ${input.targetGroupId}, ${input.createdByUserId})
        returning id
      `),
    ) as Array<{ id: number }>

    return Number(rows[0]?.id)
  }

  async readMassMail(id: number): Promise<MassMailRow | null> {
    const rows = resultRows(
      await this.db.execute(sql`select * from mass_mails where id = ${id}`),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    if (row === undefined) return null

    return {
      id: Number(row.id),
      subject: String(row.subject),
      body: String(row.body),
      targetGroupId: row.target_group_id === null ? null : Number(row.target_group_id),
      lastUserId: Number(row.last_user_id),
      queuedCount: Number(row.queued_count),
      status: String(row.status),
    }
  }

  async massMailAudience(targetGroupId: number | null): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as n from users u
         where ${this.audienceWhere(targetGroupId)}
      `),
    ) as Array<{ n: number }>
    return Number(rows[0]?.n ?? 0)
  }

  async massMailAudienceByGroup(): Promise<ReadonlyMap<number, number>> {
    const rows = resultRows(
      await this.db.execute(sql`
        select g.id as group_id, count(u.id)::int as n
          from usergroups g
          left join users u
            on (
                 u.primary_group_id = g.id
                 or exists (
                   select 1 from user_group_memberships m
                    where m.user_id = u.id and m.group_id = g.id
                 )
               )
           and ${this.audienceWhere(null)}
         group by g.id
      `),
    ) as Array<{ group_id: number; n: number }>

    return new Map(rows.map((row) => [Number(row.group_id), Number(row.n)]))
  }

  private audienceWhere(targetGroupId: number | null): SQL {
    const conditions: SQL[] = [
      sql`u.deleted_at is null`,
      sql`u.state = 'active'`,
      sql`u.email_verified_at is not null`,
    ]

    if (targetGroupId !== null) {
      conditions.push(sql`(
        u.primary_group_id = ${targetGroupId}
        or exists (
          select 1 from user_group_memberships m
           where m.user_id = u.id and m.group_id = ${targetGroupId}
        )
      )`)
    }

    return sql.join(conditions, sql` and `)
  }

  async claimMassMailChunk(massMailId: number, limit: number): Promise<MassMailChunk> {
    return this.db.transaction(async (tx) => {
      const mails = resultRows(
        await tx.execute(sql`
          select id, target_group_id, last_user_id, status
            from mass_mails where id = ${massMailId} for update
        `),
      ) as Array<Record<string, unknown>>

      const mail = mails[0]
      if (mail === undefined) throw new ValidationError(msg('error.db.such-message'))
      if (String(mail.status) !== 'sending') return { recipients: [], finished: true }

      const targetGroupId = mail.target_group_id === null ? null : Number(mail.target_group_id)
      const after = Number(mail.last_user_id)

      const rows = resultRows(
        await tx.execute(sql`
          select u.id, u.username, u.email
            from users u
           where ${this.audienceWhere(targetGroupId)} and u.id > ${after}
           order by u.id
           limit ${limit}
        `),
      ) as Array<Record<string, unknown>>

      const recipients = rows.map((row) => ({
        userId: Number(row.id),
        username: String(row.username),
        email: String(row.email),
      }))

      const finished = recipients.length < limit
      const cursor = recipients.at(-1)?.userId ?? after

      await tx.execute(sql`
        update mass_mails
           set last_user_id = ${cursor},
               queued_count = queued_count + ${recipients.length},
               status = ${finished ? 'finished' : 'sending'},
               finished_at = ${finished ? sql`now()` : sql`null`}
         where id = ${massMailId}
      `)

      return { recipients, finished }
    })
  }
}
