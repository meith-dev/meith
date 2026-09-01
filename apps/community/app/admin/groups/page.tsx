import type { Metadata } from 'next'

import { TextLink } from '@meith/ui'

import { CreateGroupForm } from '@/components/admin/group-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_ROW, PanelActionLink } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { groupAdminRepository } from '@/server/group-admin'
import { getTranslator, tr } from '@/server/i18n'
import { groupAdminCopy } from '@/view/admin-group-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.groups') }
}

export default async function AdminGroupsPage() {
  if ((await adminPageContext()) === null) return null

  const repository = groupAdminRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.groups')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-6')}
        </p>
      </PanelPage>
    )
  }

  const groups = await repository.list()
  const translator = await getTranslator()

  return (
    <PanelPage
      title={await tr('page.groups')}
      lede={
        <>
          {translator.t('adminGroups.ledeBefore')} <em>{translator.t('adminGroups.default')}</em>
          {translator.t('adminGroups.ledeBetween')}{' '}
          <TextLink href="/admin/forums">{translator.t('adminGroups.forumPermissions')}</TextLink>{' '}
          {translator.t('adminGroups.ledeEnd')}
        </>
      }
    >
      <ul className={PANEL_LIST}>
        {groups.map((group) => (
          <li key={group.id} className={PANEL_ROW}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {group.title}
                {group.isSystem && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {translator.t('adminGroups.system')}
                  </span>
                )}
                {group.isStaffGroup && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {translator.t('adminGroups.staff')}
                  </span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {group.key} · {translator.t('adminGroups.members', { count: group.memberCount })}
                {group.description === null ? '' : ` · ${group.description}`}
              </span>
            </span>
            <TextLink
              href={`/admin/groups/${group.id}`}
              aria-label={translator.t('adminGroups.editLabel', { title: group.title })}
              size="sm"
              className="shrink-0"
            >
              {translator.t('adminGroups.edit')}
            </TextLink>
          </li>
        ))}
      </ul>

      <nav className="flex flex-wrap gap-2">
        <PanelActionLink href="/admin/groups/promotions">
          {translator.t('adminGroups.promotions')}
        </PanelActionLink>
        <PanelActionLink href="/admin/groups/memberships">
          {await tr('page.mass-membership-change')}
        </PanelActionLink>
      </nav>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.add-group')}</h2>
        <CreateGroupForm
          groups={groups.map((group) => ({
            id: group.id,
            title: group.title,
            memberCount: group.memberCount,
          }))}
          copy={groupAdminCopy(translator)}
        />
      </section>
    </PanelPage>
  )
}
