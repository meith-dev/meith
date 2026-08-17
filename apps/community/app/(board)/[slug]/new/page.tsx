import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canHoldThreads } from '@meith/forums'
import { requireSlot } from '@meith/theme-kit'

import { NewThreadForm } from '@/components/content/new-thread-form'
import { attachmentLimits, canAttach } from '@/server/attachments'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { currentTheme } from '@/server/theme'
import { buildNewThreadView } from '@/view/post-form'
import { leadingId } from '@/view/slug-id'

export const metadata: Metadata = { title: 'New thread' }

export default async function NewThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const id = leadingId(slug)
  if (id === null) notFound()

  const actor = await getActor()
  const { authorizer, forums, threadWrites, drafts } = getContainer()

  if (threadWrites === null) notFound()

  const forum = await forums.findById(id)
  if (!forum || !canHoldThreads(forum.type)) notFound()

  const matrix = await authorizer.forumMatrix(actor, id)
  const target = { forumId: id, forum: matrix }
  if (!authorizer.can(actor, 'thread.view', target)) notFound()
  if (!authorizer.can(actor, 'thread.post', target)) notFound()

  const rules = await threadWrites.postingRules(id)
  if (!rules) notFound()

  const prefixes = await threadWrites.listPrefixes(id)

  const attachTarget = { ...target, allowsAttachments: rules.allowAttachments }

  const view = buildNewThreadView({
    t: await getTranslator(),
    forum: { id: forum.id, title: forum.title, slug: forum.slug },
    errorMessage:
      rules.isOpen && rules.allowThreads ? null : 'This forum is closed to new threads.',
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
                  canAttach(actor, attachTarget) ? attachmentLimits(attachTarget) : null
                }
                draft={
                  actor.userId === null || drafts === null
                    ? null
                    : await drafts.find(actor.userId, id, null)
                }
              />
            ) : null,
          toolbar: null,
        }}
      />
    </main>
  )
}
