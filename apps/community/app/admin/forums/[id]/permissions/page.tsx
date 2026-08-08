import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  CopyPermissionsForm,
  ForumPermissionRowForm,
} from '@/components/admin/forum-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { requireAdmin } from '@/server/admin'
import { buildForumMatrixView, previewCopy } from '@/server/forum-admin'

export const metadata: Metadata = { title: 'Forum permissions' }

/**
 * F65 — the permission matrix.
 *
 * Every cell is three states, because `forum_permissions` columns are nullable
 * and **null means inherit** (R4.1 layer 2). A checkbox cannot express that,
 * and a screen built from checkboxes writes an explicit value into every cell
 * on the first save — pinning the forum forever and making a later change at
 * the parent do nothing. That is the single most common way a forum's
 * permissions end up wrong, and the reason this screen looks the way it does.
 *
 * Beside every cell is what it currently *resolves* to and where that came
 * from, because "inherit" on its own tells nobody anything.
 */
export default async function ForumPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const view = await buildForumMatrixView(Number(id))
  if (view === null) notFound()

  const plan = previewCopy(view)
  const forumTitles = new Map(
    [view.forum, ...view.descendants].map((row) => [row.id, row.title]),
  )

  return (
    <PanelPage
      back={{ href: '/admin/forums', label: 'All forums' }}
      title={<>Permissions: {view.forum.title}</>}
      lede={
        <>
          <strong>Inherit</strong> is not the same as <strong>Deny</strong>. A cell left
          on Inherit follows the nearest ancestor that sets it, and the group&rsquo;s own
          default if none does — so changing that ancestor later still reaches this forum.
          Setting Deny pins it here.
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

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Copy to subforums</h2>

        {view.descendants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This forum has nothing beneath it.
          </p>
        ) : plan.changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every forum beneath this one already matches it. There is nothing to copy.
          </p>
        ) : (
          <>
            {/*
              The preview, in full. This is the only button in the panel that
              rewrites forums the operator is not looking at, and there is no
              undo — so what it would do is shown before it does it.
            */}
            <p className="text-sm text-muted-foreground">
              This would change {plan.changes.length} setting
              {plan.changes.length === 1 ? '' : 's'} across{' '}
              {new Set(plan.changes.map((change) => change.forumId)).size} forum
              {new Set(plan.changes.map((change) => change.forumId)).size === 1
                ? ''
                : 's'}
              {plan.unchanged.length > 0 &&
                `, leaving ${plan.unchanged.length} unchanged`}
              .
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

/** `null` is inherit, and has to read as a value rather than as a blank. */
function describe(value: boolean | number | null): string {
  if (value === null) return 'inherit'
  if (value === true) return 'grant'
  if (value === false) return 'deny'
  return String(value)
}
