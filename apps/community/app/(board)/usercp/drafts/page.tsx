import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { buttonVariants, TextLink } from '@meith/ui'

import { DeleteDraftForm } from '@/components/account/draft-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { buildDraftsView, draftsPageCopy } from '@/view/drafts'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.drafts') }
}

export default async function DraftsPage() {
  const actor = await getActor()
  const { drafts } = getContainer()
  if (actor.userId === null || drafts === null) notFound()

  const translator = await getTranslator()
  const rows = buildDraftsView({
    drafts: await drafts.listByUser(actor.userId),
    now: new Date(),
    t: translator,
  })
  const copy = draftsPageCopy(translator)
  const resumeLabel = await tr('draftsPage.resume')

  return (
    <PanelPage title={await tr('page.drafts')} lede={await tr('draftsPage.lede')}>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {await tr('draftsPage.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {row.kindLabel}
                  </span>
                  <TextLink href={row.resumeHref} size="sm">
                    {row.targetName}
                  </TextLink>
                </span>
                <time dateTime={row.updatedAt.iso} className="text-xs text-muted-foreground">
                  {row.updatedAt.label}
                </time>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={row.resumeHref}
                  className={buttonVariants({ variant: 'primary', size: 'sm' })}
                >
                  {resumeLabel}
                </a>
                <DeleteDraftForm forumId={row.forumId} threadId={row.threadId} copy={copy} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelPage>
  )
}
