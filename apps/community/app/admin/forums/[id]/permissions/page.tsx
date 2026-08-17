import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CopyPermissionsForm, ForumPermissionRowForm } from '@/components/admin/forum-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { buildForumMatrixView, previewCopy } from '@/server/forum-admin'
import { tr } from '@/server/i18n'

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

  const plan = previewCopy(view)
  const forumTitles = new Map([view.forum, ...view.descendants].map((row) => [row.id, row.title]))

  return (
    <PanelPage
      back={{ href: '/admin/forums', label: 'All forums' }}
      title={`Permissions: ${view.forum.title}`}
      lede={
        <>
          <strong>Inherit</strong> is not the same as <strong>Deny</strong>. A cell left on Inherit
          follows the nearest ancestor that sets it, and the group&rsquo;s own default if none does
          — so changing that ancestor later still reaches this forum. Setting Deny pins it here.
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
          />
        ))}
      </div>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">Copy to subforums</h2>

        {view.descendants.length === 0 ? (
          <p className="text-sm text-muted-foreground">This forum has nothing beneath it.</p>
        ) : plan.changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every forum beneath this one already matches it. There is nothing to copy.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This would change {plan.changes.length} setting
              {plan.changes.length === 1 ? '' : 's'} across{' '}
              {new Set(plan.changes.map((change) => change.forumId)).size} forum
              {new Set(plan.changes.map((change) => change.forumId)).size === 1 ? '' : 's'}
              {plan.unchanged.length > 0 && `, leaving ${plan.unchanged.length} unchanged`}.
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
