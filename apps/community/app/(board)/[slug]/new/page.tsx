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

  /*
   * Fixture mode has no writer, so the composer does not exist there rather
   * than existing and failing on submit — the same rule the scheduler and the
   * CLI follow: never advertise a capability that is not there (D32).
   */
  if (threadWrites === null) notFound()

  const forum = await forums.findById(id)
  if (!forum || forum.type !== 'forum') notFound()

  const matrix = await authorizer.forumMatrix(actor, id)
  const target = { forumId: id, forum: matrix }
  /*
   * Two checks, not one. Without `thread.view` the forum is not something this
   * actor may know exists, so the answer is the same 404 the listing gives;
   * with it but without `thread.post`, they may look and not write. The action
   * repeats both — rendering a page is not authorisation.
   */
  if (!authorizer.can(actor, 'thread.view', target)) notFound()
  if (!authorizer.can(actor, 'thread.post', target)) notFound()

  const rules = await threadWrites.postingRules(id)
  if (!rules) notFound()

  const prefixes = await threadWrites.listPrefixes(id)

  const view = buildNewThreadView({
    forum: { id: forum.id, title: forum.title, slug: forum.slug },
    // A closed forum still renders its composer, with the reason stated. The
    // alternative — a 404 — reads as "this forum vanished" to someone who was
    // just looking at it.
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
          // F45's island. Absent by design: the plain textarea above is the
          // posting path, and it must stay the whole path.
          toolbar: null,
        }}
      />
    </main>
  )
}
