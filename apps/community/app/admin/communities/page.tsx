import type { Metadata } from 'next'

import { buildTree, type CommunityNode, type CommunityRow } from '@meith/communities'

import { PanelPage } from '@/components/shell/panel-page'
import { CreateCommunityForm } from '@/components/admin/community-forms'
import { requireAdmin } from '@/server/admin'
import { getContainer } from '@/server/container'

export const metadata: Metadata = { title: 'Communities' }

/**
 * F65 — the community tree.
 *
 * A read-only listing with links, deliberately: creating and moving communities are
 * F16's `create` and `move`, both of which take the forest lock and re-read the
 * tree inside their transaction. Putting a create form here before the screen
 * that can *show* a move would be a panel that lets an operator build a tree it
 * cannot rearrange — which is the shape a community administration screen must not
 * have. See the F65 row for what that costs.
 */
export default async function AdminCommunitiesPage() {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const communities = await getContainer().communities.listAll()

  /*
   * Flattened depth-first from the tree rather than sorted by `path`, so the
   * order on screen is the order the board renders — which is what makes
   * "display order" mean anything to somebody editing it.
   */
  type Row = { community: CommunityRow; depth: number }
  const rows: Row[] = []
  const walk = (nodes: readonly CommunityNode<CommunityRow>[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ community: node, depth })
      walk(node.children, depth + 1)
    }
  }
  walk(buildTree(communities), 0)

  return (
    <PanelPage
      title="Communities"
      lede={
        <>
          The board&rsquo;s tree, in the order it renders. A category holds no threads; a
          link is a redirect row.
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {rows.map(({ community, depth }) => (
          <li
            key={community.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span
              className="flex min-w-0 flex-col"
              style={{ paddingLeft: `${depth * 1.25}rem` }}
            >
              <span className="truncate text-sm font-medium">{community.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {community.type} · /{community.slug} · path {community.path}
              </span>
            </span>
            <span className="flex shrink-0 gap-3 text-sm">
              <a
                href={`/admin/communities/${community.id}`}
                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Options
              </a>
              <a
                href={`/admin/communities/${community.id}/permissions`}
                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Permissions
              </a>
            </span>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Add a community</h2>
        <CreateCommunityForm
          parents={rows
            .filter(({ community }) => community.type !== 'link')
            .map(({ community, depth }) => ({
              id: community.id,
              title: community.title,
              depth,
            }))}
        />
      </section>
    </PanelPage>
  )
}
