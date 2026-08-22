import 'server-only'

import { notFound, permanentRedirect } from 'next/navigation'

import { env } from '@meith/core'
import { getDb, resolveLegacyId } from '@meith/db'
import { type LegacyTarget, legacyRedirectPath, resolveLegacyUrl } from '@meith/import'

import { getContainer } from './container'
import { getSettings } from './settings'

type Kind = 'thread' | 'forum' | 'post' | 'user'

const LEGACY_KIND: Readonly<Record<Kind, 'thread' | 'forum' | 'post' | 'user'>> = {
  thread: 'thread',
  forum: 'forum',
  post: 'post',
  user: 'user',
}

export type LegacyScript =
  | 'showthread.php'
  | 'forumdisplay.php'
  | 'member.php'
  | 'viewtopic.php'
  | 'viewforum.php'
  | 'memberlist.php'

function searchStringOf(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const item of value) search.append(key, item)
    else search.append(key, value)
  }

  const rendered = search.toString()
  return rendered === '' ? '' : `?${rendered}`
}

export async function legacyDestination(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  if (env.DATA_SOURCE !== 'postgres') return null

  const settings = await getSettings()
  if (settings.get('board.legacy_redirects') !== true) return null

  const target = resolveLegacyUrl(pathname, searchStringOf(searchParams))
  if (target === null) return null

  if (target.kind === 'home') return '/'

  const newId = await resolveLegacyId(getDb(), LEGACY_KIND[target.kind], target.legacyId)
  if (newId === null) return null

  return legacyRedirectPath(target, newId, await slugFor(target, newId))
}

export async function serveLegacyUrl(
  script: LegacyScript,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<never> {
  const path = await legacyDestination(`/${script}`, searchParams)
  if (path === null) notFound()

  permanentRedirect(path)
}

async function slugFor(target: LegacyTarget, newId: number): Promise<string | null> {
  try {
    const { forums } = getContainer()
    if (target.kind === 'forum') {
      const all = await forums.listAll()
      return all.find((forum) => forum.id === newId)?.slug ?? null
    }
    return null
  } catch {
    return null
  }
}
