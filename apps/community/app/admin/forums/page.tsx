import type { Metadata } from 'next'

import { outlineOf } from '@meith/forums'

import { PanelPage } from '@/components/shell/panel-page'
import { CreateForumForm } from '@/components/admin/forum-forms'
import { ForumTree } from '@/components/admin/forum-tree'
import { adminPageContext } from '@/server/admin'
import { getContainer } from '@/server/container'
import { PANEL_CARD } from '@/components/shell/panel-list'

export const metadata: Metadata = { title: 'Forums' }

export default async function AdminForumsPage() {
  if ((await adminPageContext()) === null) return null

  const outline = outlineOf(await getContainer().forums.listAll())

  return (
    <PanelPage
      title="Forums"
      width="wide"
      gap="loose"
      lede={
        <>
          The board&rsquo;s tree, in the order it renders, and the place to rearrange it.
          A category holds forums, and threads too where it has been told to; a link is a
          redirect row.
        </>
      }
    >
      <ForumTree rows={outline} />

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">Add a forum</h2>
        <CreateForumForm
          parents={outline
            .filter((row) => row.type !== 'link')
            .map((row) => ({ id: row.id, title: row.title, depth: row.depth }))}
        />
      </section>
    </PanelPage>
  )
}
