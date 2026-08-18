import { sql } from 'drizzle-orm'
import postgres from 'postgres'

import type { Database } from './client'
import { resultRows } from './result-rows'

export const INSTALL_LOCK_KEY = '8626403014885544245'

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

export async function markInstalled(db: Database, version: string): Promise<boolean> {
  const rows = resultRows(
    await db.execute(sql`
      insert into install_state (id, installed_version)
      values (1, ${version})
      on conflict (id) do nothing
      returning id
    `),
  )

  return rows.length > 0
}

export async function withInstallLock<T>(url: string, body: () => Promise<T>): Promise<T | null> {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    const rows = await client`
      select pg_try_advisory_lock(${INSTALL_LOCK_KEY}::bigint) as locked
    `

    if (rows[0]?.locked !== true) return null

    return await body()
  } finally {
    await client.end({ timeout: 5 })
  }
}
