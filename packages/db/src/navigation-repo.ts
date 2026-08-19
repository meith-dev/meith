import { type SQL, sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { NAVIGATION_AUDIENCES } from './schema/platform'
import { idList } from './sql-lists'

export type NavigationAudience = (typeof NAVIGATION_AUDIENCES)[number]

export interface NavigationDropTarget {
  readonly parentId: number | null
  readonly afterId: number | null
}

export interface NavigationItemRow {
  readonly id: number
  readonly key: string | null
  readonly parentId: number | null
  readonly label: string
  readonly href: string
  readonly displayOrder: number
  readonly audience: NavigationAudience
  readonly newTab: boolean
  readonly enabled: boolean
  readonly visibleToGroups: readonly number[]
}

/** A navigation item a plugin declares, already namespaced by the host. */
export interface PluginNavigationRow {
  readonly key: string
  readonly href: string
  readonly audience: NavigationAudience
}

export interface NavigationItemInput {
  readonly parentId: number | null
  readonly label: string
  readonly href: string
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
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
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
        select n.id, n.key, n.parent_id, n.label, n.href, n.display_order, n.audience,
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

  /**
   * Bring the plugin-owned rows into line with what the installed plugins ask
   * for. An item's row is created once and then belongs to the operator: its
   * label, order, nesting, audience and visibility survive every redeploy,
   * because only the address a plugin owns is refreshed here. A row whose
   * plugin is gone goes with it.
   */
  async syncPluginItems(declared: readonly PluginNavigationRow[]): Promise<{
    readonly added: readonly string[]
    readonly removed: readonly string[]
  }> {
    const existing = (await this.list()).filter((row) => row.key?.startsWith('plugin.') === true)
    const wanted = new Map(declared.map((item) => [item.key, item]))

    const removed = existing.filter((row) => !wanted.has(row.key as string))
    for (const row of removed) await this.delete(row.id)

    const added: string[] = []

    for (const item of declared) {
      const current = existing.find((row) => row.key === item.key)

      if (current === undefined) {
        await this.db.execute(sql`
          insert into navigation_items (key, parent_id, label, href, display_order, audience)
          values (${item.key}, null, '', ${item.href},
                  ${this.lastPlace(null)}, ${item.audience})
        `)
        added.push(item.key)
        continue
      }

      if (current.href !== item.href) {
        await this.db.execute(sql`
          update navigation_items set href = ${item.href} where id = ${current.id}
        `)
      }
    }

    return { added, removed: removed.map((row) => row.key as string) }
  }

  async create(input: NavigationItemInput): Promise<number> {
    assertValid(input, null)
    await this.assertParentUsable(input.parentId, null)

    const rows = resultRows(
      await this.db.execute(sql`
        insert into navigation_items (key, parent_id, label, href, display_order,
                                      audience, new_tab, enabled)
        values (null, ${input.parentId}, ${input.label}, ${input.href},
                ${this.lastPlace(input.parentId)},
                ${input.audience}, ${input.newTab}, ${input.enabled})
        returning id
      `),
    ) as Array<{ id: number }>

    const id = Number(rows[0]?.id)
    await this.setGroups(id, input.visibleToGroups)
    return id
  }

  async update(id: number, input: NavigationItemInput): Promise<void> {
    const current = await this.find(id)
    if (current === null) throw new ValidationError(msg('error.db.such-navigation-item'))

    assertValid(input, current.key)
    await this.assertParentUsable(input.parentId, id)

    const moved = input.parentId !== current.parentId

    await this.db.execute(sql`
      update navigation_items
         set parent_id = ${input.parentId}, label = ${input.label}, href = ${input.href},
             audience = ${input.audience}, new_tab = ${input.newTab},
             enabled = ${input.enabled}
             ${moved ? sql`, display_order = ${this.lastPlace(input.parentId)}` : sql``}
       where id = ${id}
    `)

    await this.setGroups(id, input.visibleToGroups)
  }

  async arrange(id: number, target: NavigationDropTarget): Promise<void> {
    const rows = await this.list()

    const row = rows.find((entry) => entry.id === id)
    if (row === undefined) throw new ValidationError(msg('error.db.such-navigation-item'))

    if (target.parentId !== null) {
      const parent = rows.find((entry) => entry.id === target.parentId)
      if (parent === undefined || parent.id === id || parent.parentId !== null) {
        throw new ValidationError(msg('error.db.navigation-item-parent-top-level'))
      }
      if (rows.some((entry) => entry.parentId === id)) {
        throw new ValidationError(msg('error.db.navigation-item-with-items-under'))
      }
    }

    const siblings = rows
      .filter((entry) => entry.parentId === target.parentId && entry.id !== id)
      .map((entry) => entry.id)

    const at = target.afterId === null ? 0 : siblings.indexOf(target.afterId) + 1 || siblings.length
    siblings.splice(at, 0, id)

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        update navigation_items set parent_id = ${target.parentId} where id = ${id}
      `)

      for (const [place, sibling] of siblings.entries()) {
        await tx.execute(sql`
          update navigation_items set display_order = ${place * 10} where id = ${sibling}
        `)
      }
    })
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(sql`delete from navigation_items where id = ${id}`)
  }

  private lastPlace(parentId: number | null): SQL {
    return sql`(select coalesce(max(display_order), -10) + 10 from navigation_items
                 where parent_id is not distinct from ${parentId})`
  }

  private async assertParentUsable(parentId: number | null, id: number | null): Promise<void> {
    if (parentId === null) return

    const rows = await this.list()

    const parent = rows.find((row) => row.id === parentId)
    if (parent === undefined || parent.id === id || parent.parentId !== null) {
      throw new ValidationError(msg('error.db.navigation-item-parent-top-level'))
    }
    if (id !== null && rows.some((row) => row.parentId === id)) {
      throw new ValidationError(msg('error.db.navigation-item-with-items-under'))
    }
  }

  private async find(id: number): Promise<NavigationItemRow | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, key, parent_id, label, href, display_order, audience, new_tab, enabled,
               '{}'::int[] as group_ids
          from navigation_items
         where id = ${id}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toRow(row)
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
