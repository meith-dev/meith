import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  CopyPermissionsForm,
  CommunityPermissionRowForm,
} from '@/components/admin/community-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { requireAdmin } from '@/server/admin'
import { buildCommunityMatrixView, previewCopy } from '@/server/community-admin'

export const metadata: Metadata = { title: 'Community permissions' }

/**
 * F65 — the permission matrix.
 *
 * Every cell is three states, because `community_permissions` columns are nullable
 * and **null means inherit** (R4.1 layer 2). A checkbox cannot express that,
 * and a screen built from checkboxes writes an explicit value into every cell
 * on the first save — pinning the community forever and making a later change at
 * the parent do nothing. That is the single most common way a community's
 * permissions end up wrong, and the reason this screen looks the way it does.
 *
 * Beside every cell is what it currently *resolves* to and where that came
 * from, because "inherit" on its own tells nobody anything.
 */
export default async function CommunityPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const view = await buildCommunityMatrixView(Number(id))
  if (view === null) notFound()

  const plan = previewCopy(view)
  const communityTitles = new Map(
    [view.community, ...view.descendants].map((row) => [row.id, row.title]),
  )

  return (
    <PanelPage
      back={{ href: '/admin/communities', label: 'All communities' }}
      title={<>Permissions: {view.community.title}</>}
      lede={
        <>
          <strong>Inherit</strong> is not the same as <strong>Deny</strong>. A cell left
          on Inherit follows the nearest ancestor that sets it, and the group&rsquo;s own
          default if none does — so changing that ancestor later still reaches this community.
          Setting Deny pins it here.
        </>
      }
      gap="loose"
    >
      <div className="flex flex-col gap-6">
        {view.rows.map((row) => (
          <CommunityPermissionRowForm
            key={row.groupId}
            communityId={view.community.id}
            row={row}
            communityTitles={communityTitles}
          />
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Copy to subcommunities</h2>

        {view.descendants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This community has nothing beneath it.
          </p>
        ) : plan.changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every community beneath this one already matches it. There is nothing to copy.
          </p>
        ) : (
          <>
            {/*
              The preview, in full. This is the only button in the panel that
              rewrites communities the operator is not looking at, and there is no
              undo — so what it would do is shown before it does it.
            */}
            <p className="text-sm text-muted-foreground">
              This would change {plan.changes.length} setting
              {plan.changes.length === 1 ? '' : 's'} across{' '}
              {new Set(plan.changes.map((change) => change.communityId)).size} community
              {new Set(plan.changes.map((change) => change.communityId)).size === 1
                ? ''
                : 's'}
              {plan.unchanged.length > 0 &&
                `, leaving ${plan.unchanged.length} unchanged`}
              .
            </p>

            <ul className="max-h-64 overflow-y-auto text-xs text-muted-foreground">
              {plan.changes.map((change) => (
                <li key={`${change.communityId}:${change.groupId}:${change.key}`}>
                  {communityTitles.get(change.communityId) ?? change.communityId} ·{' '}
                  {view.groups.find((group) => group.groupId === change.groupId)?.title ??
                    change.groupId}{' '}
                  · {change.key}: {describe(change.from)} → {describe(change.to)}
                </li>
              ))}
            </ul>

            <CopyPermissionsForm
              communityId={view.community.id}
              changeCount={plan.changes.length}
              communityCount={new Set(plan.changes.map((change) => change.communityId)).size}
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
