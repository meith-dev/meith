import type { Metadata } from 'next'

import {
  type AudienceChoice,
  type GroupChoice,
  NewNavigationItemForm,
  type ParentChoice,
} from '@/components/admin/navigation-forms'
import { NavigationTree, type NavigationTreeRow } from '@/components/admin/navigation-tree'
import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { groupAdminRepository } from '@/server/group-admin'
import { getTranslator, tr } from '@/server/i18n'
import { navigationRepository } from '@/server/navigation'
import { navigationAdminCopy } from '@/view/admin-navigation-copy'
import {
  builtInNavigation,
  NAVIGATION_AUDIENCE_MESSAGE_KEYS,
  NAVIGATION_AUDIENCE_VALUES,
  navigationLabel,
  outlineOf,
} from '@/view/navigation'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.navigation') }
}

export default async function AdminNavigationPage() {
  if ((await adminPageContext()) === null) return null

  const repository = navigationRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.navigation')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-5')}
        </p>
      </PanelPage>
    )
  }

  const groupRepository = groupAdminRepository()
  const [items, groupRows] = await Promise.all([
    repository.list(),
    groupRepository === null ? Promise.resolve([]) : groupRepository.list(),
  ])

  const translator = await getTranslator()
  const copy = navigationAdminCopy(translator)

  const audiences: readonly AudienceChoice[] = NAVIGATION_AUDIENCE_VALUES.map((audience) => ({
    value: audience,
    label: translator.t(NAVIGATION_AUDIENCE_MESSAGE_KEYS[audience]),
  }))

  const groups: readonly GroupChoice[] = groupRows.map((group) => ({
    id: group.id,
    title: group.title,
  }))

  const outline = outlineOf(items)

  const rows: readonly NavigationTreeRow[] = outline.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    depth: row.depth,
    name: navigationLabel(row, translator),
    builtIn: builtInNavigation(row.key) !== null,
    label: row.label,
    href: row.href,
    audience: row.audience,
    newTab: row.newTab,
    enabled: row.enabled,
    visibleToGroups: row.visibleToGroups,
  }))

  const parents: readonly ParentChoice[] = rows
    .filter((row) => row.depth === 0)
    .map((row) => ({ id: row.id, name: row.name }))

  return (
    <PanelPage
      back={{ href: '/admin/content', label: translator.t('page.content') }}
      title={await tr('page.navigation')}
      lede={translator.t('adminNavigation.lede')}
      gap="loose"
    >
      {rows.length === 0 ? (
        <p className={PANEL_NOTE}>{translator.t('adminNavigation.none')}</p>
      ) : (
        <NavigationTree
          rows={rows}
          audiences={audiences}
          groups={groups}
          parents={parents}
          copy={copy}
        />
      )}

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminNavigation.newItem')}
        </h2>
        <NewNavigationItemForm
          audiences={audiences}
          groups={groups}
          parents={parents}
          copy={copy}
        />
      </section>
    </PanelPage>
  )
}
