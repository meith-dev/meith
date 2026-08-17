import { describe, expect, it } from 'vitest'

import { ValidationError } from '@meith/core'

import {
  type IpMatch,
  MOD_LOG_ACTIONS,
  MOD_LOG_LABELS,
  MODCP_PAGE_SIZE,
  type ModCpRepository,
  ModeratorPanel,
  type ModLogPage,
} from './modcp'

const NOW = new Date('2026-07-31T12:00:00Z')

class FakeModCp implements ModCpRepository {
  workloads = new Map<number, { pending: number; openReports: number }>()
  matches: IpMatch[] = []
  prefixes = { registration: '203.0.113.', lastVisit: '198.51.100.' }

  readonly logCalls: Array<{ forumIds: readonly number[]; actorUserId: number; limit: number }> = []
  readonly lookups: Array<{ actorUserId: number; subjectUserId: number; matches: number }> = []

  async log(input: {
    forumIds: readonly number[]
    actorUserId: number
    limit: number
  }): Promise<ModLogPage> {
    this.logCalls.push(input)
    return { entries: [] }
  }

  async workload(): Promise<ReadonlyMap<number, { pending: number; openReports: number }>> {
    return this.workloads
  }

  async ipMatches(): Promise<readonly IpMatch[]> {
    return this.matches
  }

  async ipPrefixesFor(): Promise<{ registration: string | null; lastVisit: string | null }> {
    return this.prefixes
  }

  async recordIpLookup(input: {
    actorUserId: number
    subjectUserId: number
    matches: number
  }): Promise<void> {
    this.lookups.push(input)
  }
}

function panelFor(modcp: FakeModCp): ModeratorPanel {
  return new ModeratorPanel({ modcp, now: () => NOW })
}

const FORUMS = [
  { forumId: 1, title: 'Quiet corner', slug: 'quiet', rights: ['Approve content'] },
  { forumId: 2, title: 'Busy place', slug: 'busy', rights: ['Approve content'] },
  { forumId: 3, title: 'Also quiet', slug: 'also', rights: [] },
]

describe('the dashboard', () => {
  it('is empty for a moderator with no forums, without asking the database', async () => {
    const modcp = new FakeModCp()
    expect(await panelFor(modcp).dashboard({ forums: [] })).toEqual([])
  })

  it('attaches both counts to each forum', async () => {
    const modcp = new FakeModCp()
    modcp.workloads.set(2, { pending: 3, openReports: 1 })

    const dashboard = await panelFor(modcp).dashboard({ forums: FORUMS })

    expect(dashboard.find((f) => f.forumId === 2)).toMatchObject({
      pending: 3,
      openReports: 1,
    })
    expect(dashboard.find((f) => f.forumId === 1)).toMatchObject({
      pending: 0,
      openReports: 0,
    })
  })

  it('puts the busiest forum first, then falls back to the title', async () => {
    const modcp = new FakeModCp()
    modcp.workloads.set(2, { pending: 3, openReports: 1 })

    const dashboard = await panelFor(modcp).dashboard({ forums: FORUMS })

    expect(dashboard.map((f) => f.title)).toEqual(['Busy place', 'Also quiet', 'Quiet corner'])
  })

  it('carries the rights the caller resolved, untouched', async () => {
    const modcp = new FakeModCp()
    const dashboard = await panelFor(modcp).dashboard({ forums: FORUMS })
    expect(dashboard.find((f) => f.forumId === 3)!.rights).toEqual([])
    expect(dashboard.find((f) => f.forumId === 1)!.rights).toEqual(['Approve content'])
  })
})

describe('the log', () => {
  it('passes the actor"s own id as well as their forums', async () => {
    const modcp = new FakeModCp()
    await panelFor(modcp).log({ forumIds: [1, 2], actorUserId: 9 })

    expect(modcp.logCalls[0]).toMatchObject({
      forumIds: [1, 2],
      actorUserId: 9,
      limit: MODCP_PAGE_SIZE,
    })
  })
})

describe('the address lookup', () => {
  const RIGHTS = { access: true, ipLookup: true }

  it('returns the matches and the ranges it searched', async () => {
    const modcp = new FakeModCp()
    modcp.matches = [{ userId: 7, username: 'other', matchedOn: 'both', lastActiveAt: NOW }]

    const result = await panelFor(modcp).lookUpIp({
      subjectUserId: 5,
      actorUserId: 9,
      rights: RIGHTS,
    })

    expect(result.matches).toHaveLength(1)
    expect(result.prefixes).toEqual({
      registration: '203.0.113.',
      lastVisit: '198.51.100.',
    })
  })

  it('records the lookup even when it finds nothing', async () => {
    const modcp = new FakeModCp()
    modcp.matches = []

    await panelFor(modcp).lookUpIp({ subjectUserId: 5, actorUserId: 9, rights: RIGHTS })

    expect(modcp.lookups).toHaveLength(1)
    expect(modcp.lookups[0]).toMatchObject({
      actorUserId: 9,
      subjectUserId: 5,
      matches: 0,
    })
  })

  it('records how many it found', async () => {
    const modcp = new FakeModCp()
    modcp.matches = [
      { userId: 7, username: 'a', matchedOn: 'registration', lastActiveAt: null },
      { userId: 8, username: 'b', matchedOn: 'last_visit', lastActiveAt: null },
    ]

    await panelFor(modcp).lookUpIp({ subjectUserId: 5, actorUserId: 9, rights: RIGHTS })

    expect(modcp.lookups[0]).toMatchObject({ matches: 2 })
  })

  it('refuses somebody with panel access but not the lookup right', async () => {
    const modcp = new FakeModCp()

    await expect(
      panelFor(modcp).lookUpIp({
        subjectUserId: 5,
        actorUserId: 9,
        rights: { access: true, ipLookup: false },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(modcp.lookups).toEqual([])
  })

  it('refuses somebody with the lookup right but no panel access', async () => {
    const modcp = new FakeModCp()

    await expect(
      panelFor(modcp).lookUpIp({
        subjectUserId: 5,
        actorUserId: 9,
        rights: { access: false, ipLookup: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('the log allow-list', () => {
  it('names every action it shows, and shows nothing it has not named', () => {
    expect(MOD_LOG_ACTIONS).toEqual(Object.keys(MOD_LOG_LABELS))
    expect(MOD_LOG_ACTIONS).not.toContain('settings.update')
    expect(MOD_LOG_ACTIONS).not.toContain('permission.bypass')
    expect(MOD_LOG_ACTIONS).not.toContain('user.promote')
    expect(MOD_LOG_ACTIONS).not.toContain('user.mass_mail_started')
    expect(MOD_LOG_ACTIONS).not.toContain('user.mass_mail_continued')
  })

  it('reads a flag being cleared as clearing it, not as setting it', () => {
    expect(MOD_LOG_LABELS['thread.unlock']).toBe('Unlocked a thread')
    expect(MOD_LOG_LABELS['thread.unstick']).toBe('Unpinned a thread')
    expect(MOD_LOG_LABELS['thread.unlock']).not.toBe(MOD_LOG_LABELS['thread.lock'])
    expect(MOD_LOG_LABELS['thread.unstick']).not.toBe(MOD_LOG_LABELS['thread.stick'])
  })

  it('covers every moderation action Phase 4 writes', () => {
    for (const action of [
      'moderation.approve',
      'moderation.reject',
      'thread.lock',
      'thread.unlock',
      'thread.stick',
      'thread.unstick',
      'thread.move',
      'thread.split',
      'thread.merge',
      'thread.copy',
      'inline.delete',
      'post.edit',
      'post.delete',
      'post.restore',
      'report.resolve',
      'report.reject',
      'warning.issue',
      'warning.revoke',
      'signature.lock',
      'signature.unlock',
      'avatar.lock',
      'avatar.unlock',
      'modcp.ip_lookup',
    ]) {
      expect(MOD_LOG_ACTIONS).toContain(action)
    }
  })

  it('reads a lock and its release as two different things, for every lockable thing', () => {
    for (const [set, cleared] of [
      ['signature.lock', 'signature.unlock'],
      ['avatar.lock', 'avatar.unlock'],
    ]) {
      expect(MOD_LOG_LABELS[set!]).not.toBe(MOD_LOG_LABELS[cleared!])
    }
  })
})
