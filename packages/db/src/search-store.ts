/**
 * F73 — stored searches and search flood control.
 *
 * **A stored search holds the query, not the hits.** Freezing a result list
 * would be faster on page two and wrong in two ways that matter: the list goes
 * stale, so it keeps offering posts that have since been deleted or moved
 * somewhere private; and it is a *permission snapshot*, so a member who loses
 * access to a forum would go on seeing its hits for as long as the stored set
 * lived. Re-resolving costs one indexed query and is correct by construction —
 * every page applies the current viewer's scope.
 *
 * **The flood check is the insert.** `create` inserts conditionally on "this
 * member has not searched within the interval", so the check and the write are
 * one statement and one round trip. A read-then-write check has a window
 * between them, and search flooding is exactly the case where a caller sends
 * twenty requests at once — the race is not theoretical, it is the attack.
 */
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface StoredSearch {
  readonly id: number
  readonly token: string
  readonly userId: number | null
  readonly sessionKey: string | null
  readonly terms: string
  readonly filters: Readonly<Record<string, unknown>>
  readonly hitCount: number
  readonly createdAt: Date
}

export interface CreateSearchInput {
  readonly token: string
  readonly userId: number | null
  readonly sessionKey: string | null
  readonly terms: string
  readonly filters: Readonly<Record<string, unknown>>
  /**
   * Minimum seconds between searches. `0` disables the check entirely, which is
   * what a board with `search.flood_seconds` unset means and what an actor with
   * `flood.bypass` gets.
   */
  readonly floodSeconds: number
}

export class PostgresSearchStore {
  constructor(private readonly db: Database) {}

  /**
   * Store a search, unless this member searched too recently.
   *
   * Returns `null` when the flood check refused — a *value*, not an exception,
   * because being asked to wait is an ordinary outcome the screen shows beside
   * the box rather than an error page.
   *
   * The `not exists` runs inside the insert, so two simultaneous submissions
   * cannot both pass. The alternative — select, decide, insert — is a window
   * wide enough for exactly the traffic this exists to stop.
   *
   * A zero interval needs no special case: subtracting nothing from `now()`
   * leaves `now()`, no existing row was created after it, and the insert
   * proceeds. An earlier version also short-circuited on `floodSeconds <= 0`;
   * that clause was removed because no mutation of it could fail a test, and a
   * guard that cannot be shown to matter is one the next reader trusts for the
   * wrong reason.
   */
  async create(input: CreateSearchInput): Promise<StoredSearch | null> {
    /*
     * A guest is throttled by session rather than by user id, or every guest on
     * the board would share one bucket — one visitor searching would lock the
     * rest out, which is a denial of service dressed as a rate limit.
     */
    const owner =
      input.userId !== null
        ? sql`user_id = ${input.userId}`
        : input.sessionKey !== null
          ? sql`session_key = ${input.sessionKey}`
          : /*
             * Neither: a caller with no identity at all cannot be throttled
             * without throttling everybody, so it is not throttled here — the
             * honest answer is that flood control needs *something* to count.
             *
             * This is not the rare branch it was once described as. The session
             * key is a hash of the session cookie and a logged-out reader has
             * none, so **every guest search lands here**. What still counts
             * them is F46's hourly limit, which is keyed on the IP prefix and
             * needs no cookie; the interval is what a guest escapes.
             */
            sql`false`

    const rows = resultRows(
      await this.db.execute(sql`
        insert into searches (token, user_id, session_key, terms, filters)
        select ${input.token}, ${input.userId}, ${input.sessionKey}, ${input.terms},
               ${JSON.stringify(input.filters)}::jsonb
         where not exists (
              select 1 from searches
               where ${owner}
                 and created_at > now() - make_interval(secs => ${input.floodSeconds})
            )
        returning id, token, user_id, session_key, terms, filters, hit_count, created_at
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toStored(row)
  }

  /** Record how much the search found, for the "N results" line. */
  async recordHitCount(id: number, hitCount: number): Promise<void> {
    await this.db.execute(sql`update searches set hit_count = ${hitCount} where id = ${id}`)
  }

  async findByToken(token: string): Promise<StoredSearch | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, token, user_id, session_key, terms, filters, hit_count, created_at
          from searches where token = ${token}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toStored(row)
  }

  /**
   * Delete searches older than the retention window.
   *
   * They are a log of what members looked for, which is worth keeping for
   * exactly as long as somebody might page back through their own results and
   * not one day longer. Bounded so a maintenance tick cannot run away.
   */
  async prune(olderThan: Date, limit = 5_000): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        delete from searches
         where id in (
           select id from searches where created_at < ${olderThan} order by id limit ${limit}
         )
        returning id
      `),
    ) as Array<{ id: number }>

    return rows.length
  }
}

/**
 * May this viewer open this stored search?
 *
 * Ownership, not authorisation over the *results* — those are re-resolved
 * against whoever is asking, so another member could never see hits they are
 * not entitled to. What ownership protects is the **terms**: what somebody
 * searched for is frequently more revealing than what they found, and a
 * sequential token would otherwise make every member's searches readable.
 *
 * A row can therefore be owned by an account, by a session, or by nobody — and
 * the third is the ordinary guest, not a corner. See the last branch.
 *
 * Pure, so the rule is stated once and testable without a database.
 */
export function ownsSearch(
  search: Pick<StoredSearch, 'userId' | 'sessionKey'>,
  viewer: { readonly userId: number | null; readonly sessionKey: string | null },
): boolean {
  if (search.userId !== null) return search.userId === viewer.userId
  if (search.sessionKey !== null) {
    /*
     * A guest search belongs to a session, and only while the viewer is still
     * that guest. A member who signs in afterwards is a different subject, and
     * inheriting the session's searches would attach a stranger's terms to an
     * account.
     */
    return viewer.userId === null && search.sessionKey === viewer.sessionKey
  }

  /*
   * Neither: the search was run by a caller with no identity at all, and the
   * token is the only thing there is to check.
   *
   * **This is the guest case, not an edge case.** The session key is a hash of
   * the *session cookie*, and a visitor who has not signed in has no session
   * cookie — so every search a logged-out reader runs is stored with no user
   * and no session. Refusing those turned "search the board" into a 404 for
   * everybody who had not signed in, on every term, which is the state this
   * line is fixing. It read as the safe default and was in fact a refusal of
   * the only thing a guest can do here.
   *
   * What is left guarding it is the token, and that is enough for what
   * ownership was protecting: 144 random bits, unguessable and unenumerable,
   * held by the one browser that ran the search. `robots.txt` keeps `/search`
   * out of indexes, and the page links nowhere off-site that could carry the
   * address away in a `Referer`.
   */
  return true
}

function toStored(row: Record<string, unknown>): StoredSearch {
  const filters = row.filters
  return {
    id: Number(row.id),
    token: String(row.token),
    userId: row.user_id === null ? null : Number(row.user_id),
    sessionKey: row.session_key === null ? null : String(row.session_key),
    terms: String(row.terms),
    filters:
      typeof filters === 'object' && filters !== null && !Array.isArray(filters)
        ? (filters as Record<string, unknown>)
        : {},
    hitCount: Number(row.hit_count),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  }
}
