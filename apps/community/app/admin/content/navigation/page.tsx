import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import {
  type AudienceChoice,
  type GroupChoice,
  NavigationItemRowForm,
  type NavigationItemValues,
  NewNavigationItemForm,
} from '@/components/admin/navigation-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE } from '@/components/shell/panel-list'
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
  const [rows, groupRows] = await Promise.all([
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
        <section className={cn(PANEL_LIST, 'px-4')}>
          {rows.map((row) => {
            const values: NavigationItemValues = {
              id: row.id,
              label: row.label,
              href: row.href,
              displayOrder: row.displayOrder,
              audience: row.audience,
              newTab: row.newTab,
              enabled: row.enabled,
              visibleToGroups: row.visibleToGroups,
            }

            return (
              <div key={row.id} className="flex flex-col gap-1">
                <p className="pt-4 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {navigationLabel(row, translator)}
                  </span>
                  {' · '}
                  {builtInNavigation(row.key) === null
                    ? translator.t('adminNavigation.custom')
                    : translator.t('adminNavigation.builtIn')}
                  {!row.enabled && ` · ${translator.t('adminNavigation.hidden')}`}
                </p>
                <NavigationItemRowForm
                  item={values}
                  audiences={audiences}
                  groups={groups}
                  copy={copy}
                />
              </div>
            )
          })}
        </section>
      )}

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminNavigation.newItem')}
        </h2>
        <NewNavigationItemForm audiences={audiences} groups={groups} copy={copy} />
      </section>
    </PanelPage>
  )
}
