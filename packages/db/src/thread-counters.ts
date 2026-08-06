import { sql } from 'drizzle-orm'

import { resultRows } from './result-rows'

export interface CounterTx {
  execute(query: ReturnType<typeof sql>): Promise<unknown>
}

export interface ThreadTally {
  readonly posts: number
  readonly byAuthor: ReadonlyArray<{ userId: number; posts: number }>
  readonly threadAuthorId: number | null
}

export async function tallyThread(
  tx: CounterTx,
  threadId: number,
): Promise<ThreadTally> {
  const rows = resultRows(
    await tx.execute(sql`
      select p.author_user_id, count(*)::int as n
        from posts p
       where p.thread_id = ${threadId} and p.visibility = 'visible'
       group by p.author_user_id
    `),
  ) as Array<{ author_user_id: number | null; n: number }>

  const owner = resultRows(
    await tx.execute(sql`select author_user_id from threads where id = ${threadId}`),
  ) as Array<{ author_user_id: number | null }>

  return {
    posts: rows.reduce((total, row) => total + Number(row.n), 0),
    byAuthor: rows.flatMap((row) =>
      row.author_user_id === null
        ? []
        : [{ userId: Number(row.author_user_id), posts: Number(row.n) }],
    ),
    threadAuthorId:
      owner[0]?.author_user_id == null ? null : Number(owner[0].author_user_id),
  }
}

export async function applyForumChain(
  tx: CounterTx,
  forumId: number,
  delta: 1 | -1,
  tally: ThreadTally,
): Promise<void> {
  await tx.execute(sql`
    update forums f
       set post_count = greatest(f.post_count + ${delta * tally.posts}, 0),
           thread_count = greatest(f.thread_count + ${delta}, 0),
           updated_at = now()
      from forums child
     where child.id = ${forumId}
       and (f.id = child.id or child.path like f.path || '.%')
  `)
}

export async function applyAuthorCounts(
  tx: CounterTx,
  delta: 1 | -1,
  tally: ThreadTally,
): Promise<void> {
  for (const author of tally.byAuthor) {
    await tx.execute(sql`
      update users
         set post_count = greatest(post_count + ${delta * author.posts}, 0),
             updated_at = now()
       where id = ${author.userId}
    `)
  }
  if (tally.threadAuthorId !== null) {
    await tx.execute(sql`
      update users
         set thread_count = greatest(thread_count + ${delta}, 0), updated_at = now()
       where id = ${tally.threadAuthorId}
    `)
  }
}

export async function syncLedger(
  tx: CounterTx,
  threadId: number,
  counted: boolean,
): Promise<void> {
  if (counted) {
    await tx.execute(sql`
      insert into content_counter_rollups (post_id)
      select p.id from posts p
       where p.thread_id = ${threadId} and p.visibility = 'visible'
      on conflict (post_id) do nothing
    `)
    return
  }
  await tx.execute(sql`
    delete from content_counter_rollups r
     using posts p
     where r.post_id = p.id and p.thread_id = ${threadId}
  `)
}

export async function logModeratorAction(
  tx: CounterTx,
  action: string,
  actorUserId: number,
  detail: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await tx.execute(sql`
    insert into admin_log (user_id, action, detail, created_at)
    values (${actorUserId}, ${action}, ${JSON.stringify(detail)}::jsonb, ${at})
  `)
}
