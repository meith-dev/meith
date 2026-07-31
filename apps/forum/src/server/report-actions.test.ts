/**
 * F49 at the app layer.
 *
 * The report rules are unit-tested in `@forum/moderation` and the SQL against
 * real Postgres. What is proven here is the seam neither can see: that filing a
 * report re-authorises against the *target's* forum rather than trusting the
 * form, and that a member who cannot see something cannot learn it exists by
 * reporting it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Authorizer,
  InMemoryAuthorizationSource,
  combinePermissionSets,
} from '@forum/authorization'
import type { Actor } from '@forum/authorization'
import type {
  NewReport,
  ReportRepository,
  ReportTarget,
  ReportTargetKind,
} from '@forum/moderation'

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { RedirectError }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

const { fileReportAction } = await import('./report-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { FIXTURE_DATA_VERSION, SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import(
  './seed-board'
)

const CONTAINER_KEY = Symbol.for('@forum/forum.container')

class FakeReports implements ReportRepository {
  readonly filed: NewReport[] = []
  /** Where the target lives. Overridden per test. */
  target: ReportTarget | null = {
    kind: 'post',
    id: 50,
    forumId: SEED_FORUM.general,
    threadId: 20,
    label: 'A thread',
  }

  async resolveTarget(_kind: ReportTargetKind, _id: number): Promise<ReportTarget | null> {
    return this.target
  }

  async open(report: NewReport): Promise<number | null> {
    this.filed.push(report)
    return 1
  }

  async listOpen() {
    return { rows: [] }
  }

  async countOpen() {
    return 0
  }

  async find() {
    return null
  }

  async assign() {
    return false
  }

  async close() {
    return false
  }
}

let reports: FakeReports

function installContainer(board = SEED_BOARD): void {
  ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = {
    authorizer: new Authorizer(new InMemoryAuthorizationSource(board), {}),
    reports,
    threadTools: null,
    threadSurgery: null,
    inlineModeration: null,
    warnings: null,
    warningBans: null,
    modcp: null,
    moderationQueue: null,
    threadWrites: null,
    postWrites: null,
    threads: {
      locateForum: async () => null,
      findById: async () => null,
      listForum: async () => ({ rows: [], nextCursor: null }),
    },
    posts: {
      findVisibleById: async () => null,
      listThread: async () => ({ rows: [], nextAfterId: null }),
    },
    readState: null,
    threadViews: null,
    memberProfiles: { findPublicById: async () => null },
    fixtureDataVersion: FIXTURE_DATA_VERSION,
    dataSource: 'fixture',
  }
}

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

async function redirectOf(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (err) {
    if (err instanceof RedirectError) return err.location
    throw err
  }
  throw new Error('expected a redirect')
}

const VALID = { kind: 'post', targetId: '50', reason: 'spam' }

beforeEach(async () => {
  reports = new FakeReports()
  actorRef.current = await actorFor(SEED_GROUP.registered, 3)
  installContainer()
})

describe('fileReportAction', () => {
  it('files the report and returns to the thread', async () => {
    expect(await redirectOf(fileReportAction(EMPTY_STATE, form(VALID)))).toBe(
      '/thread/20?reported=1',
    )
    expect(reports.filed[0]).toMatchObject({ reason: 'spam', reporterUserId: 3 })
  })

  it('returns to the profile for a member report', async () => {
    reports.target = { kind: 'user', id: 9, forumId: null, threadId: null, label: 'ada' }

    expect(
      await redirectOf(
        fileReportAction(EMPTY_STATE, form({ ...VALID, kind: 'user', targetId: '9' })),
      ),
    ).toBe('/member/9?reported=1')
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const state = await fileReportAction(EMPTY_STATE, form(VALID))

    expect(state.error).toBeTruthy()
    expect(reports.filed).toHaveLength(0)
  })

  /*
   * The check that matters. The form says which row; whether this member could
   * *see* it is a question only the row's forum can answer, and reporting
   * something invisible would be a way to confirm it exists.
   */
  it('does not confirm that content in a forum it cannot see exists', async () => {
    const hidden = 555
    reports.target = {
      kind: 'post',
      id: 50,
      forumId: hidden,
      threadId: 20,
      label: 'A thread',
    }
    installContainer({
      ...SEED_BOARD,
      chains: { ...SEED_BOARD.chains, [hidden]: [hidden] },
      overrides: [
        ...SEED_BOARD.overrides,
        { forumId: hidden, groupId: SEED_GROUP.registered, overrides: { canView: false } },
      ],
    })

    const state = await fileReportAction(EMPTY_STATE, form(VALID))

    expect(state.error).toBe('That does not exist.')
    expect(reports.filed).toHaveLength(0)
  })

  /*
   * A signed-in member whose groups do not grant `canReportContent`. The guest
   * case above is refused earlier, by having no user id at all, so it proves
   * nothing about the permission itself.
   */
  it('refuses a member whose group cannot report', async () => {
    const member = await actorFor(SEED_GROUP.registered, 3)
    /*
     * Everything else about this actor is a perfectly ordinary member — they
     * can see the forum, so the target check passes and the only thing left to
     * refuse them is the permission itself. The guest case above is refused
     * earlier, by having no user id, so it proves nothing about this.
     */
    actorRef.current = {
      ...member,
      global: { ...member.global, canReportContent: false },
    }

    const state = await fileReportAction(EMPTY_STATE, form(VALID))

    expect(state.error).toBeTruthy()
    expect(reports.filed).toHaveLength(0)
  })

  it('refuses a target that is not there', async () => {
    reports.target = null

    const state = await fileReportAction(EMPTY_STATE, form(VALID))

    expect(state.error).toBe('That does not exist.')
    expect(reports.filed).toHaveLength(0)
  })

  it('keeps what was typed when the reason is too short', async () => {
    const state = await fileReportAction(EMPTY_STATE, form({ ...VALID, reason: 'x' }))

    expect(state.error).toBeTruthy()
    expect(state.values).toMatchObject({ reason: 'x' })
    expect(reports.filed).toHaveLength(0)
  })

  it('refuses a kind it does not recognise', async () => {
    const state = await fileReportAction(EMPTY_STATE, form({ ...VALID, kind: 'forum' }))

    expect(state.error).toBeTruthy()
    expect(reports.filed).toHaveLength(0)
  })

  /*
   * A duplicate is reported as success: the member did what they meant to, and
   * "you already reported this" is only useful to somebody probing the queue.
   */
  it('treats a duplicate as success', async () => {
    reports.open = async () => null

    expect(await redirectOf(fileReportAction(EMPTY_STATE, form(VALID)))).toBe(
      '/thread/20?reported=1',
    )
  })
})
