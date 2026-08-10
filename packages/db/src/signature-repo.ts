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
