import type { Metadata } from 'next'

import { outlineOf } from '@meith/forums'

import { CreateForumForm } from '@/components/admin/forum-forms'
import { ForumTree } from '@/components/admin/forum-tree'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getContainer } from '@/server/container'
import { getTranslator, tr } from '@/server/i18n'
import { forumAdminCopy } from '@/view/admin-copy'
import { forumTreeCopy } from '@/view/admin-forum-tree-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.forums') }
}

export default async function AdminForumsPage() {
  if ((await adminPageContext()) === null) return null

  const outline = outlineOf(await getContainer().forums.listAll())
  const t = await getTranslator()

  return (
    <PanelPage
      title={await tr('page.forums')}
      width="wide"
      gap="loose"
      lede={
        <>
          The board&rsquo;s tree, in the order it renders, and the place to rearrange it. A category
          holds forums, and threads too where it has been told to; a link is a redirect row.
        </>
      }
    >
      <ForumTree rows={outline} copy={forumTreeCopy(t)} />

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.add-forum')}</h2>
        <CreateForumForm
          parents={outline
            .filter((row) => row.type !== 'link')
            .map((row) => ({ id: row.id, title: row.title, depth: row.depth }))}
          copy={forumAdminCopy(t)}
        />
      </section>
    </PanelPage>
  )
}
