import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'
import { quotePrefill } from '@meith/threads'

import { MultiQuoteSelection } from '@/components/content/multiquote-selection'
import { ReplyForm } from '@/components/content/reply-form'
import { attachmentLimits, canAttach } from '@/server/attachments'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { currentTheme } from '@/server/theme'
import { replyFormCopy } from '@/view/content-copy'
import { buildReplyView } from '@/view/post-form'
import { postLink } from '@/view/post-link'
import { leadingId } from '@/view/slug-id'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.reply') }
}

function quotedPostId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export default async function ReplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ quote?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = leadingId(slug)
  if (id === null) notFound()

  const actor = await getActor()
  const { authorizer, posts, threadWrites, drafts } = getContainer()
  if (threadWrites === null) notFound()

  const target = await threadWrites.replyTarget(id)
  if (target?.visibility !== 'visible') notFound()

  const scope = {
    forumId: target.forum.id,
    forum: await authorizer.forumMatrix(actor, target.forum.id),
    allowsAttachments: target.forum.allowAttachments,
  }
  if (!authorizer.can(actor, 'thread.view', scope)) notFound()
  if (!authorizer.can(actor, 'reply.post', scope)) notFound()

  const moderates = authorizer.can(actor, 'content.viewUnapproved', scope)
  const locked = target.isLocked && !moderates

  const quoteId = quotedPostId(query.quote)
  let prefill = ''
  if (quoteId !== null) {
    const quoted = await posts.findQuotable(id, quoteId)
    if (quoted) {
      prefill = quotePrefill({
        authorUsername: quoted.authorUsername,
        message: quoted.message,
        sourceHref: postLink(`/thread/${target.threadId}-${target.slug}`, quoted.id),
      })
    }
  }

  const view = buildReplyView({
    t: await getTranslator(),
    thread: { id: target.threadId, title: target.title, slug: target.slug },
    errorMessage: locked ? 'This thread is locked.' : null,
  })

  const PostForm = requireSlot(await currentTheme(), 'PostForm')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <PostForm
        {...view}
        regions={{
          form: locked ? null : (
            <>
              <MultiQuoteSelection threadId={target.threadId} insertOnMount />
              <ReplyForm
                copy={replyFormCopy(await getTranslator())}
                threadId={target.threadId}
                seenLastPostId={target.lastPostId}
                prefill={prefill}
                canSubscribe={authorizer.can(actor, 'forum.subscribe', scope)}
                attachmentLimits={canAttach(actor, scope) ? attachmentLimits(scope) : null}
                draft={
                  actor.userId === null || drafts === null
                    ? null
                    : await drafts.find(actor.userId, target.forum.id, target.threadId)
                }
              />
            </>
          ),
          toolbar: null,
        }}
      />
    </main>
  )
}
