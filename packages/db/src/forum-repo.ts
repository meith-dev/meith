import { asc, eq, sql } from 'drizzle-orm'

import type {
  ForumListingRow,
  ForumRepository,
  ForumRow,
  ForumType,
  LastPostSummary,
  MovePlan,
  MoveTarget,
  NewForum,
} from '@meith/forums'
import { childPath, planCreate, planMove } from '@meith/forums'

import type { Database } from './client'
import { forums } from './schema'

const FOREST_LOCK_KEY = 0x0f01_0001

const FORUM_COLUMNS = {
  id: forums.id,
  type: forums.type,
  title: forums.title,
  slug: forums.slug,
  description: forums.description,
  parentId: forums.parentId,
  path: forums.path,
  depth: forums.depth,
  displayOrder: forums.displayOrder,
  linkUrl: forums.linkUrl,
} as const

const FORUM_LISTING_COLUMNS = {
  ...FORUM_COLUMNS,
  allowThreads: forums.allowThreads,
  threadCount: forums.threadCount,
  postCount: forums.postCount,
  lastPostId: forums.lastPostId,
  lastPostThreadId: forums.lastPostThreadId,
  lastPostThreadTitle: forums.lastPostThreadTitle,
  lastPostUserId: forums.lastPostUserId,
  lastPostUsername: forums.lastPostUsername,
  lastPostAt: forums.lastPostAt,
} as const

type SelectedForum = {
  [K in keyof typeof FORUM_COLUMNS]: unknown
}

type SelectedListingForum = {
  [K in keyof typeof FORUM_LISTING_COLUMNS]: unknown
}

function toForumRow(row: SelectedForum): ForumRow {
  return {
    id: row.id as number,
    type: row.type as ForumType,
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

function toLastPost(row: SelectedListingForum): LastPostSummary | null {
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

export class PostgresForumRepository implements ForumRepository {
  constructor(private readonly db: Database) {}

  async listAll(): Promise<ForumRow[]> {
    const rows = await this.db
      .select(FORUM_COLUMNS)
      .from(forums)
      .orderBy(asc(forums.displayOrder), asc(forums.id))
    return rows.map(toForumRow)
  }

  async listListing(): Promise<ForumListingRow[]> {
    const rows = await this.db
      .select(FORUM_LISTING_COLUMNS)
      .from(forums)
      .orderBy(asc(forums.displayOrder), asc(forums.id))

    return rows.map((row) => ({
      ...toForumRow(row),
      allowThreads: row.allowThreads as boolean,
      threadCount: row.threadCount as number,
      postCount: row.postCount as number,
      lastPost: toLastPost(row),
    }))
  }

  async findById(id: number): Promise<ForumRow | null> {
    const rows = await this.db.select(FORUM_COLUMNS).from(forums).where(eq(forums.id, id)).limit(1)
    const row = rows[0]
    return row ? toForumRow(row) : null
  }

  async create(input: NewForum): Promise<ForumRow> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${FOREST_LOCK_KEY})`)

      const rows = (await tx.select(FORUM_COLUMNS).from(forums)).map(toForumRow)
      const plan = planCreate(rows, input)

      const inserted = await tx
        .insert(forums)
        .values({
          type: input.type,
          title: input.title.trim(),
          slug: input.slug,
          description: input.description ?? null,
          parentId: plan.parentId,
          linkUrl: input.linkUrl ?? null,
          allowThreads: input.type === 'forum',
          displayOrder: plan.displayOrder,
          depth: plan.depth,
          path: '',
        })
        .returning({ id: forums.id })

      const id = inserted[0]?.id
      if (id === undefined) throw new Error('Forum insert returned no id')

      const path = childPath(plan.parentPath, id)
      await tx.update(forums).set({ path }).where(eq(forums.id, id))

      const created = await tx.select(FORUM_COLUMNS).from(forums).where(eq(forums.id, id)).limit(1)
      return toForumRow(created[0] as SelectedForum)
    })
  }

  async move(forumId: number, target: MoveTarget): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${FOREST_LOCK_KEY})`)

      const rows = (await tx.select(FORUM_COLUMNS).from(forums).orderBy(asc(forums.id))).map(
        toForumRow,
      )

      await this.applyPlanWith(tx, planMove(rows, forumId, target))
    })
  }

  async applyMove(plan: MovePlan): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${FOREST_LOCK_KEY})`)
      await this.applyPlanWith(tx, plan)
    })
  }

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
        update ${forums} as f
        set path = v.path, depth = v.depth, updated_at = now()
        from (values ${values}) as v(id, path, depth)
        where f.id = v.id
      `)
    }

    await tx
      .update(forums)
      .set({ parentId: plan.newParentId, updatedAt: new Date() })
      .where(eq(forums.id, plan.forumId))

    if (plan.orderUpdates.length > 0) {
      const values = sql.join(
        plan.orderUpdates.map((o) => sql`(${o.id}::int, ${o.displayOrder}::int)`),
        sql`, `,
      )
      await tx.execute(sql`
        update ${forums} as f
        set display_order = v.display_order, updated_at = now()
        from (values ${values}) as v(id, display_order)
        where f.id = v.id
      `)
    }
  }
}
