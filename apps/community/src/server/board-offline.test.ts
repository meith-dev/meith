import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import { emptyPermissionSet, type PermissionSet } from '@meith/core'
import { SettingsSnapshot } from '@meith/settings'

let overrides = new Map<string, string>()
let viewer: Actor

vi.mock('./settings', () => ({
  getSettings: async () => SettingsSnapshot.fromOverrides(overrides),
}))
vi.mock('./context', () => ({ getActor: async () => viewer }))

const { OFFLINE_FALLBACK_MESSAGE, boardOffline } = await import('./board-offline')
const { offlineFeed } = await import('./feed-routes')
const { OfflineNotice } = await import('../components/shell/offline-notice')

function actorWith(global: Partial<PermissionSet>, actor: Partial<Actor> = {}): Actor {
  return {
    userId: 7,
    groupIds: [2],
    primaryGroupId: 2,
    state: 'active',
    global: { ...emptyPermissionSet(), ...global },
    permissionVersion: 1,
    ...actor,
  }
}

const GUEST = actorWith({}, { userId: null, groupIds: [1], primaryGroupId: 1, state: 'guest' })
const MEMBER = actorWith({})
const PERMITTED = actorWith({ canViewBoardOffline: true })
const ADMIN = actorWith({ isAdministrator: true, canAccessAdminCp: true })

const MESSAGE = 'Back within the hour — we are moving the database.'

function offline(message = MESSAGE): void {
  overrides = new Map([
    ['board.offline', 'true'],
    ['board.offline_message', message],
  ])
}

beforeEach(() => {
  overrides = new Map()
  viewer = GUEST
})

describe('an online board', () => {
  it('lets a guest through', async () => {
    expect(await boardOffline()).toBeNull()
  })

  it('lets a member through', async () => {
    viewer = MEMBER
    expect(await boardOffline()).toBeNull()
  })
})

describe('an offline board', () => {
  it('refuses a guest', async () => {
    offline()
    expect(await boardOffline()).toEqual({ message: MESSAGE })
  })

  it('refuses an ordinary member', async () => {
    offline()
    viewer = MEMBER
    expect(await boardOffline()).toEqual({ message: MESSAGE })
  })

  it('admits a member whose group carries the permission', async () => {
    offline()
    viewer = PERMITTED
    expect(await boardOffline()).toBeNull()
  })

  it('admits an administrator, whose group need not carry it', async () => {
    offline()
    viewer = ADMIN
    expect(await boardOffline()).toBeNull()
  })

  it('falls back to a maintenance line when the message is blank', async () => {
    offline('   ')
    expect(await boardOffline()).toEqual({ message: OFFLINE_FALLBACK_MESSAGE })
  })
})

describe('the offline page', () => {
  it('renders the operator’s message', async () => {
    offline()
    const notice = await boardOffline()
    expect(notice).not.toBeNull()

    const html = renderToStaticMarkup(createElement(OfflineNotice, notice!))
    expect(html).toContain(MESSAGE)
  })

  it('renders the fallback line when the operator left the message empty', async () => {
    offline('')
    const notice = await boardOffline()

    const html = renderToStaticMarkup(createElement(OfflineNotice, notice!))
    expect(html).toContain(OFFLINE_FALLBACK_MESSAGE)
  })
})

describe('the feeds', () => {
  it('stay open while the board is online', async () => {
    expect(await offlineFeed()).toBeNull()
  })

  it('answer 503 with the message while the board is offline', async () => {
    offline()
    const response = await offlineFeed()

    expect(response?.status).toBe(503)
    expect(await response!.text()).toBe(MESSAGE)
  })

  it('stay open for a reader carrying the permission', async () => {
    offline()
    viewer = PERMITTED
    expect(await offlineFeed()).toBeNull()
  })
})

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../../app')

function gatingLayoutsAbove(route: string): string[] {
  expect(existsSync(join(APP, route))).toBe(true)

  const segments = route.split('/').slice(0, -1)
  const found: string[] = []

  for (let depth = 0; depth <= segments.length; depth += 1) {
    const layout = join(APP, ...segments.slice(0, depth), 'layout.tsx')
    if (!existsSync(layout)) continue
    if (readFileSync(layout, 'utf8').includes('board-offline')) found.push(layout)
  }

  return found
}

describe('what the gate covers', () => {
  it('closes the board index', () => {
    expect(gatingLayoutsAbove('(board)/page.tsx')).toHaveLength(1)
  })

  it('closes the panels nested inside the board', () => {
    expect(gatingLayoutsAbove('(board)/usercp/page.tsx')).toHaveLength(1)
    expect(gatingLayoutsAbove('(board)/modcp/page.tsx')).toHaveLength(1)
  })

  it('leaves /login reachable, so an administrator can sign in', () => {
    expect(gatingLayoutsAbove('(auth)/login/page.tsx')).toEqual([])
  })

  it('leaves /admin reachable, so the switch can be turned back off', () => {
    expect(gatingLayoutsAbove('admin/page.tsx')).toEqual([])
  })

  it('leaves the health endpoint open', () => {
    expect(gatingLayoutsAbove('api/health/route.ts')).toEqual([])
    expect(readFileSync(join(APP, 'api/health/route.ts'), 'utf8')).not.toContain('board-offline')
  })
})
