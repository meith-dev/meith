import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BadgeUploadForm } from '@/components/admin/badge-forms'
import {
  DeleteGroupForm,
  GroupIdentityForm,
  GroupPermissionsForm,
} from '@/components/admin/group-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { buildGroupPermissionView, groupAdminRepository } from '@/server/group-admin'
import { badgeKey, badgeSrc } from '@/server/group-badge'
import { getTranslator, tr } from '@/server/i18n'
import { MAX_IMAGE_BYTES } from '@/server/image-upload'
import { boardSampleSurfaces } from '@/server/theme-admin'
import { groupAdminCopy } from '@/view/admin-group-copy'
import { badgeFormsCopy } from '@/view/admin-panel-copy'
import { oklchPickerCopy } from '@/view/admin-theme-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.group') }
}

export default async function AdminGroupPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await adminPageContext()) === null) return null

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const view = await buildGroupPermissionView(Number(id))
  if (view === null) notFound()

  const groups = (await groupAdminRepository()?.list()) ?? []
  const t = await getTranslator()
  const copy = { ...groupAdminCopy(t), ...oklchPickerCopy(t) }
  const badgeCopy = badgeFormsCopy(t)

  const [lightBadge, darkBadge] = await Promise.all([
    badgeKey(view.group.id, 'light'),
    badgeKey(view.group.id, 'dark'),
  ])
  const badges = {
    light: lightBadge === null ? null : badgeSrc(view.group.id, 'light', lightBadge),
    dark: darkBadge === null ? null : badgeSrc(view.group.id, 'dark', darkBadge),
  }

  return (
    <PanelPage
      back={{ href: '/admin/groups', label: t.t('adminGroups.all') }}
      title={view.group.title}
      lede={
        <>
          <code className="text-xs">{view.group.key}</code> ·{' '}
          {t.t('adminGroupDetail.members', { count: view.group.memberCount })}
          {view.group.isSystem && ` · ${t.t('adminGroupDetail.systemGroup')}`}
        </>
      }
      gap="loose"
    >
      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t.t('adminGroupDetail.details')}</h2>
        <GroupIdentityForm
          group={{
            id: view.group.id,
            title: view.group.title,
            description: view.group.description ?? '',
            displayOrder: view.group.displayOrder,
            isStaffGroup: view.group.isStaffGroup,
            pluginGrantable: view.group.pluginGrantable,
            badgeToken: view.group.badgeToken ?? '',
            nameColorLight: view.group.nameColorLight ?? '',
            nameColorDark: view.group.nameColorDark ?? '',
          }}
          surfaces={await boardSampleSurfaces()}
          copy={copy}
        />
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t.t('adminGroupDetail.badge')}</h2>
        <p className="text-sm text-muted-foreground">{t.t('adminGroupDetail.badgeHint')}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <BadgeUploadForm
            groupId={view.group.id}
            scheme="light"
            label={t.t('adminGroupDetail.light')}
            src={badges.light}
            maxKib={MAX_IMAGE_BYTES / 1024}
            copy={badgeCopy}
          />
          <BadgeUploadForm
            groupId={view.group.id}
            scheme="dark"
            label={t.t('adminGroupDetail.dark')}
            src={badges.dark}
            maxKib={MAX_IMAGE_BYTES / 1024}
            copy={badgeCopy}
          />
        </div>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {t.t('adminGroupDetail.permissions')}
        </h2>
        <p className="text-sm text-muted-foreground">{t.t('adminGroupDetail.permissionsHint')}</p>
        <GroupPermissionsForm groupId={view.group.id} cells={view.cells} copy={copy} />
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t.t('adminGroupDetail.delete')}</h2>
        {view.group.isSystem ? (
          <p className="text-sm text-muted-foreground">
            {t.t('adminGroupDetail.deleteSystemHint')}
          </p>
        ) : (
          <DeleteGroupForm
            groupId={view.group.id}
            groups={groups.map((group) => ({
              id: group.id,
              title: group.title,
              memberCount: group.memberCount,
            }))}
            copy={copy}
          />
        )}
      </section>
    </PanelPage>
  )
}
