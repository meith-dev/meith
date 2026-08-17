import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isAppError } from '@meith/core'
import { type DiscoveryViewModel, requireSlot } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { DISCOVER_PAGE, DISCOVERY_VIEWS, isDiscoveryView, runDiscovery } from '@/server/discovery'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildDiscoveryView, DISCOVERY_LABELS } from '@/view/discovery-view'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ view: string }>
}): Promise<Metadata> {
  const { view } = await params
  const t = await getTranslator()

  return {
    title: isDiscoveryView(view) ? t.t(DISCOVERY_LABELS[view].labelKey) : t.t('discovery.title'),
  }
}

export default async function DiscoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { view } = await params
  if (!isDiscoveryView(view)) notFound()

  const query = await searchParams
  const one = (key: string): string | undefined => {
    const raw = query[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text === undefined || text === '' ? undefined : text
  }

  const at = new Date(one('at') ?? '')
  const threadId = Number(one('after'))
  const after =
    !Number.isNaN(at.getTime()) && Number.isSafeInteger(threadId) && threadId > 0
      ? { at, threadId }
      : null

  const actor = await getActor()
  const preferences = await getViewerPreferences()
  const now = new Date()

  const DiscoveryView = requireSlot(await currentTheme(), 'DiscoveryView')
  const themed = async (model: DiscoveryViewModel) =>
    filterView('view.discovery-view', model, viewerRef(actor))

  const common = {
    view,
    views: DISCOVERY_VIEWS,
    pageSize: DISCOVER_PAGE,
    isFirstPage: after === null,
    now,
    timeZone: preferences.timezone,
  } as const

  let page: Awaited<ReturnType<typeof runDiscovery>>
  try {
    page = await runDiscovery({
      actor,
      view,
      now,
      timeZone: preferences.timezone,
      after,
    })
  } catch (err) {
    if (isAppError(err)) {
      return (
        <DiscoveryView
          {...(await themed(
            buildDiscoveryView({
              ...common,
              rows: [],
              nextHref: null,
              refusalMessage: err.message,
            }),
          ))}
        />
      )
    }
    throw err
  }

  return (
    <DiscoveryView
      {...(await themed(
        buildDiscoveryView({
          ...common,
          rows: page.rows,
          nextHref:
            page.nextCursor === null
              ? null
              : `/discover/${view}?at=${encodeURIComponent(
                  page.nextCursor.at.toISOString(),
                )}&after=${page.nextCursor.threadId}`,
        }),
      ))}
    />
  )
}
