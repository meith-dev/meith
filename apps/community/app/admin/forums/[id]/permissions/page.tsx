import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CopyPermissionsForm, ForumPermissionRowForm } from '@/components/admin/forum-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { buildForumMatrixView, previewCopy } from '@/server/forum-admin'
import { getTranslator, tr } from '@/server/i18n'
import { forumAdminCopy } from '@/view/admin-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.forum-permissions') }
}

export default async function ForumPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const view = await buildForumMatrixView(Number(id))
  if (view === null) notFound()

  const t = await getTranslator()
  const plan = previewCopy(view)
  const forumTitles = new Map([view.forum, ...view.descendants].map((row) => [row.id, row.title]))

  return (
    <PanelPage
      back={{ href: '/admin/forums', label: t.t('adminForums.all') }}
      title={t.t('adminForums.permissionsTitle', { title: view.forum.title })}
      lede={
        <>
          <strong>{t.t('adminForums.inherit')}</strong>
          {t.t('adminForums.permissionsLedeBetween')} <strong>{t.t('adminForums.deny')}</strong>
          {t.t('adminForums.permissionsLedeEnd')}
        </>
      }
      gap="loose"
    >
      <div className="flex flex-col gap-6">
        {view.rows.map((row) => (
          <ForumPermissionRowForm
            key={row.groupId}
            forumId={view.forum.id}
            row={row}
            forumTitles={forumTitles}
            copy={forumAdminCopy(t)}
          />
        ))}
      </div>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.copy-subforums')}</h2>

        {view.descendants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {await tr('page.this-forum-has-nothing-beneath')}
          </p>
        ) : plan.changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {await tr('page.every-forum-beneath-this-one')}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t.t('adminForums.copyPreview', {
                changes: plan.changes.length,
                forums: new Set(plan.changes.map((change) => change.forumId)).size,
                unchanged: plan.unchanged.length,
              })}
            </p>

            <ul className="max-h-64 overflow-y-auto text-xs text-muted-foreground">
              {plan.changes.map((change) => (
                <li key={`${change.forumId}:${change.groupId}:${change.key}`}>
                  {forumTitles.get(change.forumId) ?? change.forumId} ·{' '}
                  {view.groups.find((group) => group.groupId === change.groupId)?.title ??
                    change.groupId}{' '}
                  · {change.key}: {describe(change.from)} → {describe(change.to)}
                </li>
              ))}
            </ul>

            <CopyPermissionsForm
              forumId={view.forum.id}
              changeCount={plan.changes.length}
              forumCount={new Set(plan.changes.map((change) => change.forumId)).size}
              copy={forumAdminCopy(t)}
            />
          </>
        )}
      </section>
    </PanelPage>
  )
}

function describe(value: boolean | number | null): string {
  if (value === null) return 'inherit'
  if (value === true) return 'grant'
  if (value === false) return 'deny'
  return String(value)
}
