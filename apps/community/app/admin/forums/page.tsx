import type { Metadata } from 'next'

import { buildTree, type ForumNode, type ForumRow } from '@meith/forums'

import { PanelPage } from '@/components/shell/panel-page'
import { CreateForumForm } from '@/components/admin/forum-forms'
import { adminPageContext } from '@/server/admin'
import { getContainer } from '@/server/container'

export const metadata: Metadata = { title: 'Forums' }

export default async function AdminForumsPage() {
  if ((await adminPageContext()) === null) return null

  const forums = await getContainer().forums.listAll()

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
          The board&rsquo;s tree, in the order it renders. A category holds forums, and
          threads too where it has been told to; a link is a redirect row.
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
