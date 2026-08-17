import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import {
  Authorizer,
  combinePermissionSets,
  InMemoryAuthorizationSource,
  type MemoryAppointment,
} from '@meith/authorization'
import type { MoveDestination, ThreadToolsRepository, ThreadToolTarget } from '@meith/moderation'

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

const { threadToolAction } = await import('./thread-tool-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import('./seed-board')

const { installTestContainer, CONTAINER_KEY } = await import('./test-container')
const { ThreadToolsForm } = await import('../components/moderation/thread-tools-form')
const { threadToolsHeading } = await import('../view/thread-view')

class FakeTools implements ThreadToolsRepository {
  readonly calls: string[] = []
  forumId: number = SEED_FORUM.general
  copiedTo: number | null = null

  async find(): Promise<ThreadToolTarget | null> {
    return {
      id: 20,
      forumId: this.forumId,
      slug: 'hello',
      title: 'Hello',
      isLocked: false,
      isSticky: false,
      visibility: 'visible',
    }
  }

  async findDestination(): Promise<MoveDestination | null> {
    return { id: SEED_FORUM.announcements, type: 'forum', allowThreads: true }
  }

  async setLocked(): Promise<boolean> {
    this.calls.push('setLocked')
    return true
  }

  async setSticky(): Promise<boolean> {
    this.calls.push('setSticky')
    return true
  }

  async setVisibility(): Promise<boolean> {
    this.calls.push('setVisibility')
    return true
  }

  async move(input: Parameters<ThreadToolsRepository['move']>[0]): Promise<boolean> {
    this.calls.push('move')
    this.forumId = input.toForumId
    return true
  }

  async copy(
    input: Parameters<ThreadToolsRepository['copy']>[0],
  ): Promise<{ threadId: number; slug: string; posts: number }> {
    this.calls.push('copy')
    this.copiedTo = input.toForumId
    return { threadId: 77, slug: 'hello', posts: 3 }
  }
}

let tools: FakeTools

function appointment(forumId: number, rights: Partial<MemoryAppointment>): MemoryAppointment {
  return {
    userId: 3,
    forumId,
    cascadeToSubforums: false,
    canApproveContent: false,
    canEditPosts: false,
    canSoftDeletePosts: false,
    canRestorePosts: false,
    canOpenCloseThreads: false,
    canStickThreads: false,
    canMoveThreads: false,
    canMergeThreads: false,
    canSplitThreads: false,
    ...rights,
  }
}

function installContainer(moderators: readonly MemoryAppointment[] = []): void {
  installTestContainer({ moderators, container: { threadTools: tools } })
}

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

function browserSubmit(html: string, submitter: { name: string; value: string }): FormData {
  const formHtml = html
    .split('<form')
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf('</form>')))
    .find((chunk) => chunk.includes(`value="${submitter.value}"`))
  if (formHtml === undefined) throw new Error(`no form contains value="${submitter.value}"`)

  const f = new FormData()
  let pressed = false
  for (const control of formHtml.match(/<input[^>]*>|<select[\s\S]*?<\/select>|<button[^>]*>/g) ??
    []) {
    const name = /\bname="([^"]*)"/.exec(control)?.[1]
    if (name === undefined) continue
    if (control.startsWith('<select')) {
      const selected = /<option[^>]*\bvalue="([^"]*)"/.exec(control)?.[1]
      if (selected !== undefined) f.append(name, selected)
      continue
    }
    const value = /\bvalue="([^"]*)"/.exec(control)?.[1] ?? ''
    if (control.startsWith('<button')) {
      if (!pressed && name === submitter.name && value === submitter.value) {
        f.append(name, value)
        pressed = true
      }
      continue
    }
    f.append(name, value)
  }
  if (!pressed) throw new Error(`no submit button named ${submitter.name}=${submitter.value}`)
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

beforeEach(async () => {
  tools = new FakeTools()
  actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)
  installContainer()
})

describe('threadToolAction', () => {
  it('locks and returns to the thread', async () => {
    expect(
      await redirectOf(threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))),
    ).toBe('/thread/20-hello?tool=lock')
    expect(tools.calls).toEqual(['setLocked'])
  })

  it('refuses a guest and an ordinary member', async () => {
    for (const [group, id] of [
      [SEED_GROUP.guest, null],
      [SEED_GROUP.registered, 3],
    ] as const) {
      actorRef.current = await actorFor(group, id)
      const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))
      expect(state.error).toBeTruthy()
    }
    expect(tools.calls).toEqual([])
  })

  it('honours a partial appointment', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canOpenCloseThreads: true })])

    expect(
      await redirectOf(threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))),
    ).toBe('/thread/20-hello?tool=lock')

    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'stick' }))
    expect(state.error).toMatch(/cannot pin/i)
    expect(tools.calls).toEqual(['setLocked'])
  })

  it('needs the move right in the destination as well as the source', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canMoveThreads: true })])

    const state = await threadToolAction(
      EMPTY_STATE,
      form({
        threadId: '20',
        tool: 'move',
        toForumId: String(SEED_FORUM.announcements),
      }),
    )
    expect(state.error).toMatch(/cannot move threads into/i)
    expect(tools.calls).toEqual([])

    installContainer([
      appointment(SEED_FORUM.general, { canMoveThreads: true }),
      appointment(SEED_FORUM.announcements, { canMoveThreads: true }),
    ])
    expect(
      await redirectOf(
        threadToolAction(
          EMPTY_STATE,
          form({
            threadId: '20',
            tool: 'move',
            toForumId: String(SEED_FORUM.announcements),
          }),
        ),
      ),
    ).toBe('/thread/20-hello?tool=move')
  })

  it('does not confirm a thread in a forum it cannot see', async () => {
    const hidden = 555
    tools.forumId = hidden
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = undefined
    installContainer()
    const board = {
      ...SEED_BOARD,
      chains: { ...SEED_BOARD.chains, [hidden]: [hidden] },
      overrides: [
        ...SEED_BOARD.overrides,
        { forumId: hidden, groupId: SEED_GROUP.registered, overrides: { canView: false } },
      ],
    }
    ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = {
      ...((globalThis as Record<symbol, unknown>)[CONTAINER_KEY] as object),
      authorizer: new Authorizer(new InMemoryAuthorizationSource(board), {}),
    }

    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'lock' }))

    expect(state.error).toBe('That thread does not exist.')
    expect(tools.calls).toEqual([])
  })

  it('refuses a tool it does not recognise', async () => {
    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'incinerate' }))
    expect(state.error).toBeTruthy()
    expect(tools.calls).toEqual([])
  })
})

describe('copy', () => {
  it('needs the move right in the destination as well as the source', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, 3)
    installContainer([appointment(SEED_FORUM.general, { canMoveThreads: true })])

    const state = await threadToolAction(
      EMPTY_STATE,
      form({
        threadId: '20',
        tool: 'copy',
        toForumId: String(SEED_FORUM.announcements),
      }),
    )
    expect(state.error).toMatch(/cannot copy threads into/i)
    expect(tools.calls).toEqual([])
  })

  it('copies, not moves, when the rendered form is submitted via the Copy button', async () => {
    const html = renderToStaticMarkup(
      createElement(ThreadToolsForm, {
        threadId: 20,
        isLocked: false,
        isSticky: false,
        rights: { lock: true, stick: true, move: true, delete: true },
        moveTargets: [{ id: SEED_FORUM.announcements, title: 'Announcements' }],
      }),
    )

    const submitted = browserSubmit(html, { name: 'tool', value: 'copy' })

    expect(await redirectOf(threadToolAction(EMPTY_STATE, submitted))).toBe(
      '/thread/77-hello?tool=copy',
    )
    expect(tools.calls).toEqual(['copy'])
    expect(tools.forumId).toBe(SEED_FORUM.general)
    expect(tools.copiedTo).toBe(SEED_FORUM.announcements)
  })

  it('still moves when the rendered form is submitted via the Move button', async () => {
    const html = renderToStaticMarkup(
      createElement(ThreadToolsForm, {
        threadId: 20,
        isLocked: false,
        isSticky: false,
        rights: { lock: true, stick: true, move: true, delete: true },
        moveTargets: [{ id: SEED_FORUM.announcements, title: 'Announcements' }],
      }),
    )

    const submitted = browserSubmit(html, { name: 'tool', value: 'move' })

    expect(await redirectOf(threadToolAction(EMPTY_STATE, submitted))).toBe(
      '/thread/20-hello?tool=move',
    )
    expect(tools.calls).toEqual(['move'])
    expect(tools.forumId).toBe(SEED_FORUM.announcements)
  })

  it('lands on the copy rather than on the source', async () => {
    expect(
      await redirectOf(
        threadToolAction(
          EMPTY_STATE,
          form({
            threadId: '20',
            tool: 'copy',
            toForumId: String(SEED_FORUM.announcements),
          }),
        ),
      ),
    ).toBe('/thread/77-hello?tool=copy')
    expect(tools.calls).toEqual(['copy'])
  })
})

describe('deleting a thread you started', () => {
  const AUTHOR = 4
  const BYSTANDER = 5

  function installOwnThreads(granted: boolean, authorUserId: number | null = AUTHOR): void {
    installTestContainer({
      board: {
        ...SEED_BOARD,
        moderators: [],
        overrides: [
          ...SEED_BOARD.overrides,
          {
            forumId: SEED_FORUM.general,
            groupId: SEED_GROUP.registered,
            overrides: { canDeleteOwnThreads: granted },
          },
        ],
      },
      container: {
        threadTools: tools,
        threads: {
          locate: async () => ({ forumId: SEED_FORUM.general, authorUserId }),
          findById: async () => null,
          listForum: async () => ({ rows: [], nextCursor: null }),
        },
      },
    })
  }

  beforeEach(async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, AUTHOR)
    installOwnThreads(true)
  })

  it('lets the author take it down when the forum grants it', async () => {
    expect(
      await redirectOf(threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'delete' }))),
    ).toBe(`/${SEED_FORUM.general}?thread=deleted`)
    expect(tools.calls).toEqual(['setVisibility'])
  })

  it('refuses somebody who did not start it', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, BYSTANDER)

    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'delete' }))

    expect(state.error).toMatch(/cannot delete threads/i)
    expect(tools.calls).toEqual([])
  })

  it('refuses the author where the forum denies it', async () => {
    installOwnThreads(false)

    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'delete' }))

    expect(state.error).toMatch(/cannot delete threads/i)
    expect(tools.calls).toEqual([])
  })

  it('does not hand the author the undo along with it', async () => {
    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'restore' }))

    expect(state.error).toMatch(/cannot restore threads/i)
    expect(tools.calls).toEqual([])
  })

  it('grants nothing when the thread has no author to be', async () => {
    installOwnThreads(true, null)

    const state = await threadToolAction(EMPTY_STATE, form({ threadId: '20', tool: 'delete' }))

    expect(state.error).toMatch(/cannot delete threads/i)
    expect(tools.calls).toEqual([])
  })
})

describe('the panel an author sees', () => {
  function render(
    rights: Parameters<typeof ThreadToolsForm>[0]['rights'],
    heading?: string,
  ): string {
    return renderToStaticMarkup(
      createElement(ThreadToolsForm, {
        threadId: 20,
        isLocked: false,
        isSticky: false,
        rights,
        moveTargets: [],
        ...(heading === undefined ? {} : { heading }),
      }),
    )
  }

  const AUTHOR_ONLY = { lock: false, stick: false, move: false, delete: true }

  it('is headed Thread tools, and says so to a screen reader too', () => {
    const html = render(AUTHOR_ONLY, threadToolsHeading(false))

    expect(html).toContain('aria-label="Thread tools"')
    expect(html).toContain('>Thread tools<')
    expect(html).not.toContain('Moderator tools')
  })

  it('offers the author the delete button and no moderator tool beside it', () => {
    const html = render(AUTHOR_ONLY, threadToolsHeading(false))

    expect(html).toContain('Delete thread')
    for (const absent of ['Lock', 'Unlock', 'Pin', 'Unpin', 'Move', 'Copy']) {
      expect(html).not.toContain(`>${absent}<`)
    }
  })

  it('still reads Moderator tools for an appointee, and by default', () => {
    const everything = { lock: true, stick: true, move: true, delete: true }

    expect(render(everything, threadToolsHeading(true))).toContain('aria-label="Moderator tools"')
    expect(render(everything)).toContain('aria-label="Moderator tools"')
  })
})
