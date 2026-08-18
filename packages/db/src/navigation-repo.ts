import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { NAVIGATION_AUDIENCES } from './schema/platform'
import { idList } from './sql-lists'

export type NavigationAudience = (typeof NAVIGATION_AUDIENCES)[number]

export interface NavigationItemRow {
  readonly id: number
  readonly key: string | null
  readonly label: string
  readonly href: string
  readonly displayOrder: number
  readonly audience: NavigationAudience
  readonly newTab: boolean
  readonly enabled: boolean
  readonly visibleToGroups: readonly number[]
}

export interface NavigationItemInput {
  readonly label: string
  readonly href: string
  readonly displayOrder: number
  readonly audience: NavigationAudience
  readonly newTab: boolean
  readonly enabled: boolean
  readonly visibleToGroups: readonly number[]
}

function audienceOf(value: unknown): NavigationAudience {
  const text = String(value)
  const found = NAVIGATION_AUDIENCES.find((audience) => audience === text)
  return found ?? 'all'
}

function groupsOf(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => Number(entry)).filter((id) => Number.isSafeInteger(id))
}

function toRow(row: Record<string, unknown>): NavigationItemRow {
  return {
    id: Number(row.id),
    key: row.key === null || row.key === undefined ? null : String(row.key),
    label: String(row.label),
    href: String(row.href),
    displayOrder: Number(row.display_order),
    audience: audienceOf(row.audience),
    newTab: row.new_tab === true,
    enabled: row.enabled === true,
    visibleToGroups: groupsOf(row.group_ids),
  }
}

export class PostgresNavigationRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<readonly NavigationItemRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select n.id, n.key, n.label, n.href, n.display_order, n.audience,
               n.new_tab, n.enabled,
               coalesce(
                 (select array_agg(g.group_id order by g.group_id)
                    from navigation_item_groups g
                   where g.item_id = n.id),
                 '{}'::int[]
               ) as group_ids
          from navigation_items n
         order by n.display_order, n.id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toRow)
  }

  async create(input: NavigationItemInput): Promise<number> {
    assertValid(input, null)

    const rows = resultRows(
      await this.db.execute(sql`
        insert into navigation_items (key, label, href, display_order, audience, new_tab, enabled)
        values (null, ${input.label}, ${input.href}, ${input.displayOrder},
                ${input.audience}, ${input.newTab}, ${input.enabled})
        returning id
      `),
    ) as Array<{ id: number }>

    const id = Number(rows[0]?.id)
    await this.setGroups(id, input.visibleToGroups)
    return id
  }

  async update(id: number, input: NavigationItemInput): Promise<void> {
    const key = await this.keyOf(id)
    if (key === undefined) throw new ValidationError(msg('error.db.such-navigation-item'))

    assertValid(input, key)

    await this.db.execute(sql`
      update navigation_items
         set label = ${input.label}, href = ${input.href},
             display_order = ${input.displayOrder}, audience = ${input.audience},
             new_tab = ${input.newTab}, enabled = ${input.enabled}
       where id = ${id}
    `)

    await this.setGroups(id, input.visibleToGroups)
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(sql`delete from navigation_items where id = ${id}`)
  }

  private async keyOf(id: number): Promise<string | null | undefined> {
    const rows = resultRows(
      await this.db.execute(sql`select key from navigation_items where id = ${id}`),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    if (row === undefined) return undefined
    return row.key === null || row.key === undefined ? null : String(row.key)
  }

  private async setGroups(id: number, groupIds: readonly number[]): Promise<void> {
    await this.db.execute(sql`delete from navigation_item_groups where item_id = ${id}`)

    const wanted = [...new Set(groupIds)]
    if (wanted.length === 0) return

    await this.db.execute(sql`
      insert into navigation_item_groups (item_id, group_id)
      select ${id}, id from usergroups where id in ${idList(wanted)}
    `)
  }
}

function assertValid(input: NavigationItemInput, key: string | null): void {
  if (key === null && input.label.trim() === '') {
    throw new ValidationError(msg('error.db.navigation-item-needs-label'))
  }
  if (input.href.trim() === '') {
    throw new ValidationError(msg('error.db.navigation-item-needs-address'))
  }
}
