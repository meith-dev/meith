/**
 * F58 — signatures over Postgres.
 *
 * Five columns on `users` and four small statements. The only decision worth
 * reading is that **locking keeps the text**: a moderator who empties a
 * signature has left nothing to stop it being retyped and nothing that says it
 * was a decision, so `lock` sets a flag and a reason and leaves the source
 * alone. An appeal can then look at what was actually there.
 */
import { sql } from 'drizzle-orm'

import { BodyFormat } from '@meith/markdown'
import type { StoredSignature } from '@meith/signatures'

import type { Database } from './client'
import { resultRows } from './result-rows'

interface RawSignature {
  signature: string
  signature_html: string | null
  signature_render_version: number
  signature_format: number
  signature_locked: boolean
  signature_locked_reason: string | null
}

function toSignature(row: RawSignature): StoredSignature {
  return {
    signature: row.signature,
    signatureHtml: row.signature_html,
    signatureRenderVersion: Number(row.signature_render_version),
    signatureFormat: Number(row.signature_format),
    locked: row.signature_locked === true,
    lockedReason: row.signature_locked_reason,
  }
}

const COLUMNS = sql`
  signature, signature_html, signature_render_version, signature_format,
  signature_locked, signature_locked_reason
`

export class PostgresSignatureRepository {
  constructor(private readonly db: Database) {}

  async read(userId: number): Promise<StoredSignature | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${COLUMNS} from users where id = ${userId} and deleted_at is null
      `),
    ) as RawSignature[]

    return rows[0] === undefined ? null : toSignature(rows[0])
  }

  /**
   * Every signature needed by one page, in one query.
   *
   * A thread page shows a signature per distinct author, and a query per author
   * is an N+1 on the board's heaviest page. Locked and empty ones come back
   * too — the caller decides what to show, and `signatureHtml` already answers
   * that in one place.
   */
  async readMany(userIds: readonly number[]): Promise<ReadonlyMap<number, StoredSignature>> {
    if (userIds.length === 0) return new Map()

    const rows = resultRows(
      await this.db.execute(sql`
        select id, ${COLUMNS}
          from users
         where id in (${sql.join(
           userIds.map((id) => sql`${id}`),
           sql`, `,
         )})
      `),
    ) as Array<RawSignature & { id: number }>

    return new Map(rows.map((row) => [Number(row.id), toSignature(row)]))
  }

  /**
   * Save a member's own signature.
   *
   * Refuses to write a **locked** one in the `where` clause rather than by
   * checking first: a moderator locking a signature while the member has the
   * form open is exactly the race this closes, and a prior read would lose it.
   * Returns false when nothing was written.
   */
  async save(input: {
    readonly userId: number
    readonly signature: string
    readonly signatureHtml: string
    readonly renderVersion: number
  }): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        update users
           set signature = ${input.signature},
               signature_html = ${input.signatureHtml},
               signature_render_version = ${input.renderVersion},
               /*
                * A save is what takes a member off the legacy format for good:
                * what they just typed in the composer is Markdown, whatever the
                * row said a moment ago.
                */
               signature_format = ${BodyFormat.Markdown}
         where id = ${input.userId} and signature_locked = false
        returning id
      `),
    ) as Array<{ id: number }>

    return rows.length > 0
  }

  /** Lock or unlock somebody's signature. Unlocking clears the reason. */
  async setLocked(input: {
    readonly userId: number
    readonly locked: boolean
    readonly reason: string | null
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set signature_locked = ${input.locked},
             signature_locked_reason = ${input.locked ? input.reason : null}
       where id = ${input.userId}
    `)
  }
}
