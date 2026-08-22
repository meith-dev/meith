import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { diffLines } from '@meith/posts'
import { Card, CardContent, CardHeader, CardTitle } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { rollbackPostAction } from '@/server/content-actions'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { getTranslator, tr } from '@/server/i18n'
import { resolvePostScope } from '@/server/post-scope'
import { leadingId } from '@/view/slug-id'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('postHistory.title') }
}

function revisionId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export default async function PostHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; postId: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const [{ slug, postId: postValue }, query, actor] = await Promise.all([
    params,
    searchParams,
    getActor(),
  ])
  const threadId = leadingId(slug)
  const postId = revisionId(postValue)
  if (threadId === null || postId === null || postId === 0) notFound()

  const scope = await resolvePostScope(threadId, postId, actor)
  if (scope === null || !scope.mayViewHistory) notFound()

  const revisions = await getContainer().posts.listRevisions(threadId, postId)
  if (revisions.length < 2) notFound()

  const requestedFrom = revisionId(query.from)
  const requestedTo = revisionId(query.to)
  const to =
    revisions.find((entry) => entry.revision === requestedTo) ?? revisions.at(-1)!
  const toIndex = revisions.findIndex((entry) => entry.revision === to.revision)
  const from =
    revisions.find((entry) => entry.revision === requestedFrom) ??
    revisions[Math.max(0, toIndex - 1)]!
  const translator = await getTranslator()
  const now = new Date()
  const backHref = `/thread/${scope.target.thread.id}-${scope.target.thread.slug}#post-${postId}`

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <PanelPage
        title={translator.t('postHistory.title')}
        lede={translator.t('postHistory.lede')}
        back={{ href: backHref, label: translator.t('postHistory.back') }}
        width="wide"
      >
        <Card>
          <CardHeader>
            <CardTitle>
              {translator.t('postHistory.comparing', {
                from: from.revision,
                to: to.revision,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border font-mono text-sm">
              {diffLines(from.message, to.message).map((line, index) => (
                <div
                  key={`${line.kind}-${index}`}
                  className={
                    line.kind === 'added'
                      ? 'bg-primary/10 px-3 py-1 text-foreground'
                      : line.kind === 'removed'
                        ? 'bg-destructive/10 px-3 py-1 text-foreground'
                        : 'px-3 py-1 text-muted-foreground'
                  }
                >
                  <span className="select-none" aria-hidden="true">
                    {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
                  </span>
                  <span>{line.value || ' '}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-3" aria-labelledby="revision-list-heading">
          <h2 id="revision-list-heading" className="font-heading text-lg font-semibold">
            {translator.t('postHistory.revisions')}
          </h2>
          {revisions.map((revision, index) => {
            const previous = revisions[index - 1]
            return (
              <Card key={revision.revision}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="font-medium">
                      {revision.current
                        ? translator.t('postHistory.current')
                        : translator.t('postHistory.revision', { revision: revision.revision })}
                    </p>
                    <p className="text-muted-foreground">
                      {translator.t('postHistory.editedBy', {
                        username: revision.editedByUsername,
                        date: formatTime(revision.createdAt, now, translator).label,
                      })}
                    </p>
                    {revision.reason !== null && <p>{revision.reason}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {previous !== undefined && (
                      <a
                        className="font-medium text-primary underline underline-offset-4"
                        href={`?from=${previous.revision}&to=${revision.revision}`}
                      >
                        {translator.t('postHistory.comparePrevious')}
                      </a>
                    )}
                    {scope.mayRollback && !revision.current && (
                      <form action={rollbackPostAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="threadId" value={threadId} />
                        <input type="hidden" name="postId" value={postId} />
                        <input type="hidden" name="revision" value={revision.revision} />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" required name="confirm" value="1" />
                          <span>{translator.t('postHistory.confirmRollback')}</span>
                        </label>
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                        >
                          {translator.t('postHistory.rollback')}
                        </button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </section>
      </PanelPage>
    </main>
  )
}
