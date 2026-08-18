import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { pluginPagePath } from '@meith/plugin-kit'

import { boardUrl } from '@/server/board-url'
import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { pluginBoardPageTitle, renderPluginBoardPage } from '@/server/plugin-pages'
import { viewerRef } from '@/server/plugin-view'

interface RouteParams {
  readonly key: string
  readonly path?: string[]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>
}): Promise<Metadata> {
  const { key, path } = await params
  const title = pluginBoardPageTitle(key, (path ?? []).join('/'))
  return title === null ? {} : { title }
}

export default async function PluginBoardPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { key, path } = await params
  const segments = path ?? []
  if (segments.length > 1) notFound()
  const pagePath = segments.join('/')

  const query: Record<string, string> = {}
  for (const [name, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query[name] = value
  }

  const actor = await getActor()
  const result = await renderPluginBoardPage(key, pagePath, {
    viewer: viewerRef(actor),
    query,
    boardUrl: await boardUrl(),
  })

  if (result.outcome === 'missing') notFound()
  if (result.outcome === 'sign-in-first') {
    redirect(`/login?next=${encodeURIComponent(pluginPagePath(key, pagePath))}`)
  }

  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 flex-1"
    >
      <h1 className="font-heading text-2xl font-semibold">{result.title}</h1>
      {result.node === null ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {(await getTranslator()).t('board.plugin.failed')}
        </p>
      ) : (
        result.node
      )}
    </main>
  )
}
