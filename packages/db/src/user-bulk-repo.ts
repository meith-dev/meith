/**
 * F67 — the two bulk operations over the membership: pruning and mass mail.
 *
 * They are the same shape as everything else in this panel — dry run first,
 * bounded batches, a keyset cursor — and each has one rule that is not about
 * mechanism at all.
 *
 * **A prune never touches an account that cannot be recovered from a mistake.**
 * Staff, banned accounts and anybody who has posted are excluded, because the
 * damage from pruning one of those is not "an account is gone", it is a hole in
 * the board's history or a lifted ban nobody decided to lift. The criteria are
 * deliberately narrow and the dry run is not optional.
 *
 * **Mass mail goes only to verified addresses.** An unverified address is as
 * likely to be a typo, or somebody else's mailbox, as it is to be the
 * member's — and a board that mails thousands of them stops being delivered
 * anywhere. That rule is in the query rather than in a checkbox, because it is
 * not a preference.
 */
import { sql, type SQL } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { withPermissionVersionBump } from './permission-version'
import { resultRows } from './result-rows'

export interface PruneCriteria {
  /** Registered strictly before this. Required — a prune needs a boundary. */
  readonly registeredBefore: Date
  /** Never active, or last active before this. Optional. */
  readonly inactiveSince?: Date | undefined
  /** Only accounts still awaiting activation. */
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
  /** A handful of real rows, so the count is not the only evidence. */
  readonly sample: readonly PruneCandidate[]
}

export interface PruneChunkResult {
  readonly pruned: number
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

  /* ---------------------------------------------------------------- *
   * Pruning
   * ---------------------------------------------------------------- */

  /**
   * The prune predicate, in one place.
   *
   * Three exclusions are unconditional and are the reason this is a function
   * rather than a filter the caller assembles:
   *
   *  - **anybody who has posted.** Their account is attached to content, and
   *    what should happen to that content is a decision (F71's), not something
   *    a maintenance sweep guesses at;
   *  - **staff.** A quiet administrator who registered years ago and reads more
   *    than they write is the most likely person to match a naive "inactive"
   *    filter, and the least acceptable to delete;
   *  - **banned accounts.** The ban record is the reason they are quiet.
   *    Removing the account removes the evidence and, on some schemas, the ban.
   */
  private pruneWhere(criteria: PruneCriteria): SQL {
    const conditions: SQL[] = [
      sql`u.deleted_at is null`,
      sql`u.created_at < ${criteria.registeredBefore}`,
      sql`u.post_count = 0`,
      sql`u.thread_count = 0`,
      sql`u.state <> 'banned'`,
      sql`not exists (
        select 1 from usergroups g
         where g.id = u.primary_group_id and g.is_staff_group = true
      )`,
      sql`not exists (
        select 1 from user_group_memberships m
          join usergroups g on g.id = m.group_id
         where m.user_id = u.id and g.is_staff_group = true
      )`,
      /*
       * Never anyone who has moderated a community, whatever group they are in.
       * An appointment is a job somebody was given; a sweep must not undo it.
       */
      sql`not exists (select 1 from community_moderators f where f.user_id = u.id)`,
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

  /** What a prune would remove: a count, and a few of the actual rows. */
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
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
      })),
    }
  }

  /**
   * Prune one batch.
   *
   * Soft-delete, like a merge's losing account and for the same reason: the row
   * is what anything still pointing at it resolves to, and "a former member"
   * renders where a dangling id crashes. It also means a prune run against a
   * wrong date is recoverable — `deleted_at` can be cleared — where a delete of
   * ten thousand rows is not.
   */
  async pruneChunk(criteria: PruneCriteria, limit: number): Promise<PruneChunkResult> {
    const where = this.pruneWhere(criteria)

    const pruned = await withPermissionVersionBump(this.db, async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          update users
             set deleted_at = now(), updated_at = now()
           where id in (
             select u.id from users u where ${where} order by u.id limit ${limit}
           )
          returning id
        `),
      ) as Array<{ id: number }>
      return rows.length
    })

    const remaining = resultRows(
      await this.db.execute(sql`select count(*)::int as n from users u where ${where}`),
    ) as Array<{ n: number }>

    return { pruned, remaining: Number(remaining[0]?.n ?? 0) }
  }

  /* ---------------------------------------------------------------- *
   * Mass mail
   * ---------------------------------------------------------------- */

  async createMassMail(input: {
    readonly subject: string
    readonly body: string
    readonly targetGroupId: number | null
    readonly createdByUserId: number | null
  }): Promise<number> {
    if (input.subject.trim() === '') throw new ValidationError('A message needs a subject.')
    if (input.body.trim() === '') throw new ValidationError('A message needs a body.')

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

  /** How many members a mass mail would reach. */
  async massMailAudience(targetGroupId: number | null): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as n from users u
         where ${this.audienceWhere(targetGroupId)}
      `),
    ) as Array<{ n: number }>
    return Number(rows[0]?.n ?? 0)
  }

  /**
   * Who is eligible.
   *
   * Verified addresses only, and never a deleted or banned account. The
   * verification rule is not a preference an operator can override: mailing
   * thousands of unverified addresses is how a board's domain stops being
   * delivered, and the members it would reach are the ones least likely to have
   * asked for anything.
   */
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

  /**
   * Claim the next batch of recipients and advance the cursor.
   *
   * The cursor moves **in the same transaction** as the read. Two presses of
   * the button, or a double-submitted form, would otherwise both read from the
   * same point and mail those members twice — and a duplicate mass mail is the
   * one mistake in this panel that cannot be taken back at all.
   */
  async claimMassMailChunk(massMailId: number, limit: number): Promise<MassMailChunk> {
    return this.db.transaction(async (tx) => {
      const mails = resultRows(
        await tx.execute(sql`
          select id, target_group_id, last_user_id, status
            from mass_mails where id = ${massMailId} for update
        `),
      ) as Array<Record<string, unknown>>

      const mail = mails[0]
      if (mail === undefined) throw new ValidationError('No such message.')
      if (String(mail.status) !== 'sending') return { recipients: [], finished: true }

      const targetGroupId =
        mail.target_group_id === null ? null : Number(mail.target_group_id)
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
