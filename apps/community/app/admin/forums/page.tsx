import type { Metadata } from 'next'

import { buildTree, type ForumNode, type ForumRow } from '@meith/forums'

import { PanelPage } from '@/components/shell/panel-page'
import { CreateForumForm } from '@/components/admin/forum-forms'
import { requireAdmin } from '@/server/admin'
import { getContainer } from '@/server/container'

export const metadata: Metadata = { title: 'Forums' }

/**
 * F65 — the forum tree.
 *
 * A read-only listing with links, deliberately: creating and moving forums are
 * F16's `create` and `move`, both of which take the forest lock and re-read the
 * tree inside their transaction. Putting a create form here before the screen
 * that can *show* a move would be a panel that lets an operator build a tree it
 * cannot rearrange — which is the shape a forum administration screen must not
 * have. See the F65 row for what that costs.
 */
export default async function AdminForumsPage() {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const forums = await getContainer().forums.listAll()

  /*
   * Flattened depth-first from the tree rather than sorted by `path`, so the
   * order on screen is the order the board renders — which is what makes
   * "display order" mean anything to somebody editing it.
   */
  type Row = { forum: ForumRow; depth: number }
  const rows: Row[] = []
  const walk = (nodes: readonly ForumNode<ForumRow>[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ forum: node, depth })
      walk(node.children, depth + 1)
    }
  }
  walk(buildTree(forums), 0)

  return (
    <PanelPage
      title="Forums"
      lede={
        <>
          The board&rsquo;s tree, in the order it renders. A category holds no threads; a
          link is a redirect row.
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {rows.map(({ forum, depth }) => (
          <li
            key={forum.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span
              className="flex min-w-0 flex-col"
              style={{ paddingLeft: `${depth * 1.25}rem` }}
            >
              <span className="truncate text-sm font-medium">{forum.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {forum.type} · /{forum.slug} · path {forum.path}
              </span>
            </span>
            {/*
              Named for the forum they open, not "Options" and "Permissions".

              A board with thirty forums renders sixty links carrying two words
              between them, so a reader moving by link — a screen reader's link
              list, or anything that reads the page out of order — is offered
              thirty identical "Options" with nothing to tell them apart. The
              visible word stays short because the title is on the row beside it;
              `aria-label` carries the rest (WCAG 2.4.4).
            */}
            <span className="flex shrink-0 gap-3 text-sm">
              <a
                href={`/admin/forums/${forum.id}`}
                aria-label={`Options for ${forum.title}`}
                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Options
              </a>
              <a
                href={`/admin/forums/${forum.id}/permissions`}
                aria-label={`Permissions for ${forum.title}`}
                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Permissions
              </a>
            </span>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Add a forum</h2>
        <CreateForumForm
          parents={rows
            .filter(({ forum }) => forum.type !== 'link')
            .map(({ forum, depth }) => ({
              id: forum.id,
              title: forum.title,
              depth,
            }))}
        />
      </section>
    </PanelPage>
  )
}
