import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { NewThreadForm } from '@/components/content/new-thread-form'
import { attachmentLimits, canAttach } from '@/server/attachments'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
import { buildNewThreadView } from '@/view/post-form'

export const metadata: Metadata = { title: 'New thread' }

function forumId(value: string): number | null {
  const match = /^(\d+)(?:-|$)/.exec(value)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export default async function NewThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const id = forumId(slug)
  if (id === null) notFound()

  const actor = await getActor()
  const { authorizer, forums, threadWrites, drafts } = getContainer()

  if (threadWrites === null) notFound()

  const forum = await forums.findById(id)
  if (!forum || forum.type !== 'forum') notFound()

  const matrix = await authorizer.forumMatrix(actor, id)
  const target = { forumId: id, forum: matrix }
  if (!authorizer.can(actor, 'thread.view', target)) notFound()
  if (!authorizer.can(actor, 'thread.post', target)) notFound()

  const rules = await threadWrites.postingRules(id)
  if (!rules) notFound()

  const prefixes = await threadWrites.listPrefixes(id)

  const view = buildNewThreadView({
    forum: { id: forum.id, title: forum.title, slug: forum.slug },
    errorMessage:
      rules.isOpen && rules.allowThreads
        ? null
        : 'This forum is closed to new threads.',
  })

  const PostForm = requireSlot(await currentTheme(), 'PostForm')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <PostForm
        {...view}
        regions={{
          form:
            rules.isOpen && rules.allowThreads ? (
              <NewThreadForm
                forumId={id}
                prefixes={prefixes.map((p) => ({ id: p.id, label: p.label }))}
                requiresPrefix={rules.requiresPrefix}
                canSubscribe={authorizer.can(actor, 'forum.subscribe', target)}
                canPostPoll={authorizer.can(actor, 'poll.post', target)}
                attachmentLimits={
                  canAttach(actor, target) ? attachmentLimits(target) : null
                }
                draft={actor.userId === null || drafts === null ? null : await drafts.find(actor.userId, id, null)}
              />
            ) : null,
          toolbar: null,
        }}
      />
    </main>
  )
}
