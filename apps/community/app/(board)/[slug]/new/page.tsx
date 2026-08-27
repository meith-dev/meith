import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canHoldThreads } from '@meith/forums'
import { requireSlot, slotCopy } from '@meith/theme-kit'

import { NewThreadForm } from '@/components/content/new-thread-form'
import { OnboardingBanner } from '@/components/shell/onboarding-banner'
import { attachmentLimits, canAttach } from '@/server/attachments'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { firstPostGuidance } from '@/server/onboarding'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'
import { newThreadFormCopy } from '@/view/content-copy'
import { buildEditorToolbarModel } from '@/view/editor-toolbar'
import { buildNewThreadView } from '@/view/post-form'
import { leadingId } from '@/view/slug-id'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.new-thread') }
}

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
      rules.isOpen && rules.allowThreads
        ? null
        : (await getTranslator()).t('board.newThread.closed'),
  })

  const theme = await currentTheme()
  const PostForm = requireSlot(theme, 'PostForm')
  const EditorToolbar = requireSlot(theme, 'EditorToolbar')
  const translator = await getTranslator()
  const open = rules.isOpen && rules.allowThreads
  const attachable = canAttach(actor, attachTarget)
  const toolbarModel = !open
    ? null
    : await filterView(
        'view.editor-toolbar',
        buildEditorToolbarModel({ attachments: attachable, t: translator }),
        viewerRef(actor),
      )

  const editorToolbar =
    toolbarModel === null ? undefined : (
      <EditorToolbar {...toolbarModel} copy={slotCopy(theme, 'EditorToolbar', translator)} />
    )

  const formModel = await filterView(
    'view.post-form',
    {
      ...view,
      regions: {
        form: open ? (
          <NewThreadForm
            copy={newThreadFormCopy(await getTranslator())}
            forumId={id}
            prefixes={prefixes.map((p) => ({ id: p.id, label: p.label }))}
            requiresPrefix={rules.requiresPrefix}
            canSubscribe={authorizer.can(actor, 'forum.subscribe', target)}
            canPostPoll={authorizer.can(actor, 'poll.post', target)}
            attachmentLimits={attachable ? attachmentLimits(attachTarget) : null}
            draft={
              actor.userId === null || drafts === null
                ? null
                : await drafts.find(actor.userId, id, null)
            }
            toolbar={editorToolbar}
          />
        ) : null,
        toolbar: null,
      },
    },
    viewerRef(actor),
  )

  const guidance = open ? await firstPostGuidance(actor).catch(() => null) : null

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      {guidance !== null && <OnboardingBanner {...guidance} />}
      <PostForm {...formModel} copy={slotCopy(theme, 'PostForm', translator)} />
    </main>
  )
}
