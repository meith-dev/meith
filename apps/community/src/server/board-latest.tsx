import 'server-only'

import type { Actor } from '@meith/authorization'
import { contentScopeFrom } from '@meith/core'
import { getDb, type LatestScope, PostgresLatestRepository } from '@meith/db'
import { requireSlot } from '@meith/theme-kit'

import { buildLatestPostsModel, buildLatestThreadsModel } from '@/view/board-latest'
import { distinctUserIds } from '@/view/member-identity'

import { getContainer } from './container'
import { activeWordFilter } from './content-admin'
import { getActor } from './context'
import { identitiesFor } from './group-identity'
import { filterView, viewerRef } from './plugin-view'
import { currentTheme } from './theme'
import { getViewerPreferences } from './viewer-preferences'

export const LATEST_ROWS = 5

export const LATEST_REFRESH_SECONDS = 60

export function latestRepository(): PostgresLatestRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresLatestRepository(getDb()) : null
}

export async function latestScopeFor(actor: Actor): Promise<LatestScope> {
  const { authorizer } = getContainer()
  const staff = actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    ...(await authorizer.threadAudience(actor)),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}

export async function renderLatestPanels(): Promise<React.ReactNode> {
  const repo = latestRepository()
  if (repo === null) return null

  const actor = await getActor()
  const now = new Date()

  let threadRows: Awaited<ReturnType<PostgresLatestRepository['threads']>>
  let postRows: Awaited<ReturnType<PostgresLatestRepository['posts']>>
  try {
    const scope = await latestScopeFor(actor)
    ;[threadRows, postRows] = await Promise.all([
      repo.threads(LATEST_ROWS, scope),
      repo.posts(LATEST_ROWS, scope),
    ])
  } catch {
    return null
  }

  const preferences = await getViewerPreferences()
  const identities = await identitiesFor(
    distinctUserIds([
      ...threadRows.map((row) => row.authorUserId),
      ...postRows.map((row) => row.authorUserId),
    ]),
  )

  const wordFilter = await activeWordFilter()

  const theme = await currentTheme()
  const LatestThreads = requireSlot(theme, 'LatestThreads')
  const LatestPosts = requireSlot(theme, 'LatestPosts')

  const context = viewerRef(actor)
  const [threads, posts] = await Promise.all([
    filterView(
      'view.latest-threads',
      buildLatestThreadsModel({
        rows: threadRows,
        now,
        timeZone: preferences.timezone,
        identities,
      }),
      context,
    ),
    filterView(
      'view.latest-posts',
      buildLatestPostsModel({
        rows: postRows,
        now,
        timeZone: preferences.timezone,
        identities,
        wordFilter,
      }),
      context,
    ),
  ])

  return (
    <>
      <LatestThreads {...threads} />
      <LatestPosts {...posts} />
    </>
  )
}
