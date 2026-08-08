/**
 * Postgres implementation of `CommunityRepository` (F16).
 *
 * The domain owns the rules (`@meith/communities` plans a move and rejects cycles,
 * link-parents and slug collisions); this file is only responsible for reading
 * the tree in one query and applying a plan atomically.
 *
 * Two things are load-bearing here:
 *
 *  - **One transaction per move.** A half-applied reparent leaves descendants
 *    holding a path their parent no longer has. Nothing downstream can detect
 *    that — every read path trusts `path` — so it is silent corruption, and the
 *    plan calls it out explicitly.
 *  - **One statement per rewrite, not one per row.** The updates go through a
 *    `VALUES` join, so moving a fifty-community subtree is a constant number of
 *    round trips. On a transaction-mode pooler each round trip inside a
 *    transaction is expensive, and per-row updates would multiply that by the
 *    subtree size.
 */
import { asc, eq, sql } from 'drizzle-orm'

import type {
  CommunityListingRow,
  CommunityRepository,
  CommunityRow,
  CommunityType,
  LastPostSummary,
  MovePlan,
  MoveTarget,
  NewCommunity,
} from '@meith/communities'
import { childPath, planCreate, planMove } from '@meith/communities'

import type { Database } from './client'
import { communities } from './schema'

/**
 * Serialises tree mutations against each other.
 *
 * Two concurrent moves each plan against the tree as they read it, so without a
 * lock the second can apply a plan computed from a tree that no longer exists —
 * reintroducing exactly the cycle `planMove` rejected. A transaction-scoped
 * advisory lock is released automatically on commit *or* rollback, so a failed
 * move cannot wedge the ACP. The constant is arbitrary but must stay stable.
 */
const FOREST_LOCK_KEY = 0x0f01_0001

/** The columns F16 reads. Selected explicitly so a schema addition cannot
 * silently widen every tree read. */
const COMMUNITY_COLUMNS = {
  id: communities.id,
  type: communities.type,
  title: communities.title,
  slug: communities.slug,
  description: communities.description,
  parentId: communities.parentId,
  path: communities.path,
  depth: communities.depth,
  displayOrder: communities.displayOrder,
  linkUrl: communities.linkUrl,
} as const

/**
 * The listing read's extra columns (F29): counters and the last-post triplet.
 *
 * Spread onto `COMMUNITY_COLUMNS` rather than replacing it, so the two reads cannot
 * drift on the structural half — and still listed explicitly, so adding a column
 * to `communities` does not silently widen either.
 */
const COMMUNITY_LISTING_COLUMNS = {
  ...COMMUNITY_COLUMNS,
  threadCount: communities.threadCount,
  postCount: communities.postCount,
  lastPostId: communities.lastPostId,
  lastPostThreadId: communities.lastPostThreadId,
  lastPostThreadTitle: communities.lastPostThreadTitle,
  lastPostUserId: communities.lastPostUserId,
  lastPostUsername: communities.lastPostUsername,
  lastPostAt: communities.lastPostAt,
} as const

type SelectedCommunity = {
  [K in keyof typeof COMMUNITY_COLUMNS]: unknown
}

type SelectedListingCommunity = {
  [K in keyof typeof COMMUNITY_LISTING_COLUMNS]: unknown
}

/** `type` is a text column; the domain models it as a union. */
function toCommunityRow(row: SelectedCommunity): CommunityRow {
  return {
    id: row.id as number,
    type: row.type as CommunityType,
    title: row.title as string,
    slug: row.slug as string,
    description: (row.description ?? null) as string | null,
    parentId: (row.parentId ?? null) as number | null,
    path: row.path as string,
    depth: row.depth as number,
    displayOrder: row.displayOrder as number,
    linkUrl: (row.linkUrl ?? null) as string | null,
  }
}

/**
 * The last-post triplet is present or absent as a unit.
 *
 * A community with no posts has every one of these columns null. Requiring the two
 * ids *and* the timestamp before building a summary means a partially-written
 * row — which a counter bug or a half-finished import can produce — renders as
 * "no posts yet" rather than as a link to post `null`.
 */
function toLastPost(row: SelectedListingCommunity): LastPostSummary | null {
  const postId = row.lastPostId as number | null
  const threadId = row.lastPostThreadId as number | null
  const at = row.lastPostAt as Date | null

  if (postId === null || threadId === null || at === null) return null

  return {
    postId,
    threadId,
    threadTitle: (row.lastPostThreadTitle ?? '') as string,
    userId: (row.lastPostUserId ?? null) as number | null,
    username: (row.lastPostUsername ?? '') as string,
    at,
  }
}

export class PostgresCommunityRepository implements CommunityRepository {
  constructor(private readonly db: Database) {}

  /**
   * Every community in one query, ordered for determinism.
   *
   * F16 requires the tree read to be one query "regardless of depth", which the
   * materialised path delivers: there is no recursion to do, because nesting is
   * reconstructed in memory by `buildTree`.
   */
  async listAll(): Promise<CommunityRow[]> {
    const rows = await this.db
      .select(COMMUNITY_COLUMNS)
      .from(communities)
      .orderBy(asc(communities.displayOrder), asc(communities.id))
    return rows.map(toCommunityRow)
  }

  /**
   * The board index's read: every community with its counters and last post, in one
   * query regardless of depth (F29).
   *
   * There is no join. Counters and the last-post triplet are denormalised onto
   * `communities`, so the alternative — a correlated subquery or a lateral join per
   * community against `posts` — would put the largest table on the board in the path
   * of the page every visitor loads first. Keeping those columns correct is the
   * posting path's job (F38); keeping this read to one statement is this
   * method's, and `community-repo.listing.test.ts` asserts it against two board
   * sizes so an N+1 cannot hide behind a small fixture.
   */
  async listListing(): Promise<CommunityListingRow[]> {
    const rows = await this.db
      .select(COMMUNITY_LISTING_COLUMNS)
      .from(communities)
      .orderBy(asc(communities.displayOrder), asc(communities.id))

    return rows.map((row) => ({
      ...toCommunityRow(row),
      threadCount: row.threadCount as number,
      postCount: row.postCount as number,
      lastPost: toLastPost(row),
    }))
  }

  async findById(id: number): Promise<CommunityRow | null> {
    const rows = await this.db
      .select(COMMUNITY_COLUMNS)
      .from(communities)
      .where(eq(communities.id, id))
      .limit(1)
    const row = rows[0]
    return row ? toCommunityRow(row) : null
  }

  /**
   * Insert, then fill in `path` from the id the database just assigned.
   *
   * Both statements are in one transaction under the forest lock: `path` is
   * NOT NULL, so the row is briefly written with a placeholder and corrected
   * before commit. No reader can observe the intermediate value, and a failure
   * between the two leaves no row at all rather than one with a bogus path.
   */
  async create(input: NewCommunity): Promise<CommunityRow> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${FOREST_LOCK_KEY})`)

      const rows = (await tx.select(COMMUNITY_COLUMNS).from(communities)).map(toCommunityRow)
      const plan = planCreate(rows, input)

      const inserted = await tx
        .insert(communities)
        .values({
          type: input.type,
          title: input.title.trim(),
          slug: input.slug,
          description: input.description ?? null,
          parentId: plan.parentId,
          linkUrl: input.linkUrl ?? null,
          displayOrder: plan.displayOrder,
          depth: plan.depth,
          // Corrected immediately below, once the id exists.
          path: '',
        })
        .returning({ id: communities.id })

      const id = inserted[0]?.id
      if (id === undefined) throw new Error('Community insert returned no id')

      const path = childPath(plan.parentPath, id)
      await tx.update(communities).set({ path }).where(eq(communities.id, id))

      const created = await tx
        .select(COMMUNITY_COLUMNS)
        .from(communities)
        .where(eq(communities.id, id))
        .limit(1)
      return toCommunityRow(created[0] as SelectedCommunity)
    })
  }

  /**
   * Plan and apply in one transaction, holding the forest lock across both.
   *
   * The tree is re-read *inside* the transaction rather than taking a caller's
   * copy: planning against a stale snapshot is how a concurrent move slips a
   * cycle past validation.
   */
  async move(communityId: number, target: MoveTarget): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${FOREST_LOCK_KEY})`)

      const rows = (
        await tx.select(COMMUNITY_COLUMNS).from(communities).orderBy(asc(communities.id))
      ).map(toCommunityRow)

      await this.applyPlanWith(tx, planMove(rows, communityId, target))
    })
  }

  async applyMove(plan: MovePlan): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${FOREST_LOCK_KEY})`)
      await this.applyPlanWith(tx, plan)
    })
  }

  /**
   * The write half of a move. Order matters: paths and parent first, sibling
   * order last, so a reader that somehow saw an intermediate state would still
   * find a walkable tree.
   */
  private async applyPlanWith(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    plan: MovePlan,
  ): Promise<void> {
    if (plan.pathUpdates.length > 0) {
      const values = sql.join(
        plan.pathUpdates.map((u) => sql`(${u.id}::int, ${u.path}::text, ${u.depth}::int)`),
        sql`, `,
      )
      await tx.execute(sql`
        update ${communities} as f
        set path = v.path, depth = v.depth, updated_at = now()
        from (values ${values}) as v(id, path, depth)
        where f.id = v.id
      `)
    }

    await tx
      .update(communities)
      .set({ parentId: plan.newParentId, updatedAt: new Date() })
      .where(eq(communities.id, plan.communityId))

    if (plan.orderUpdates.length > 0) {
      const values = sql.join(
        plan.orderUpdates.map((o) => sql`(${o.id}::int, ${o.displayOrder}::int)`),
        sql`, `,
      )
      await tx.execute(sql`
        update ${communities} as f
        set display_order = v.display_order, updated_at = now()
        from (values ${values}) as v(id, display_order)
        where f.id = v.id
      `)
    }
  }
}
