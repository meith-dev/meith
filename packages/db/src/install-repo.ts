import { sql } from 'drizzle-orm'

import type { Database } from './client'

export async function isInstalled(db: Database): Promise<boolean> {
  try {
    const rows = (await db.execute(
      sql`select 1 from install_state where id = 1`,
    )) as unknown as unknown[]
    return rows.length > 0
  } catch {
    return false
  }
}

export async function countUsers(db: Database): Promise<number | null> {
  try {
    const rows = (await db.execute(sql`select count(*)::int as total from users`)) as unknown as {
      total: number
    }[]
    return rows[0]?.total ?? 0
  } catch {
    return null
  }
}

export async function canConnect(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}

export async function markInstalled(db: Database, version: string): Promise<void> {
  await db.execute(sql`
    insert into install_state (id, installed_version)
    values (1, ${version})
    on conflict (id) do nothing
  `)
}
