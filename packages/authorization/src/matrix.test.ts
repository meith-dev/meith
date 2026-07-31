/**
 * F22 — the permission matrix gate. Drives the full actor x context x action
 * cross product through the real Authorizer and compares against the
 * human-reviewed table in matrix.fixture.ts.
 *
 * Nothing downstream of F22 is allowed to start until this is green (R10).
 */
import { describe, expect, it } from 'vitest'

import { Authorizer } from './authorizer'
import {
  ACTORS,
  FORUM,
  MemoryAuthorizationSource,
  type ActorName,
} from './fixture'
import { EXPECTED, F22_ACTIONS, type F22Action } from './matrix.fixture'
import { NO_MODERATOR_RIGHTS } from './types'
import type { Action, Actor, Target } from './types'

const source = new MemoryAuthorizationSource()

/** Map the F22 vocabulary to the Authorizer's Action union. */
const ACTION_OF: Record<F22Action, Action> = {
  view: 'thread.view',
  postThread: 'thread.post',
  postReply: 'reply.post',
  editOwn: 'post.editOwn',
  editOthers: 'post.editOthers',
  deleteOwn: 'post.deleteOwn',
  softDelete: 'post.softDelete',
  viewUnapproved: 'content.viewUnapproved',
  viewDeleted: 'content.viewDeleted',
  approve: 'content.approve',
  lock: 'thread.lock',
  stick: 'thread.stick',
  move: 'thread.move',
  deleteThread: 'thread.delete',
  merge: 'thread.merge',
  split: 'thread.split',
  upload: 'attachment.upload',
  search: 'forum.search',
  subscribe: 'forum.subscribe',
}

const FORUM_ID: Record<string, number> = {
  public: FORUM.public,
  publicSub: FORUM.publicSub,
  private: FORUM.private,
  password: FORUM.password,
}

const SELF_OWNED = { self: true } as const
const OTHER_USER_ID = 999_001

/** A moderator only moderates the public tree in this fixture. */
function isModeratorOf(actorName: ActorName, forumName: string): boolean {
  return (
    actorName === 'forumModerator' &&
    (forumName === 'public' || forumName === 'publicSub')
  )
}

/**
 * Build the Target for one (actor, forum, action) cell: resolve the real forum
 * matrix, then set ownership so "own" actions act on the actor's own content
 * and "others" actions act on someone else's.
 */
async function buildTarget(
  authorizer: Authorizer,
  actor: Actor,
  actorName: ActorName,
  forumName: string,
  f22: F22Action,
): Promise<Target> {
  const forumId = FORUM_ID[forumName]!
  const forum = await authorizer.forumMatrix(actor, forumId)

  const ownsThisAction = f22 === 'editOwn' || f22 === 'deleteOwn'
  const ownerId = ownsThisAction ? actor.userId : OTHER_USER_ID

  return {
    forumId,
    forum,
    ownerId,
    isForumModerator: isModeratorOf(actorName, forumName),
    /*
     * The fixture's appointment carries every granular right, so the F50 tools
     * and `approve` follow `isForumModerator` in this table. A *partial*
     * appointment is the case `moderated-forums.test.ts` and
     * `thread-tool-rights.test.ts` cover: the F22 matrix is about the
     * permission model, and a partial appointment is about the appointment.
     */
    moderatorRights: isModeratorOf(actorName, forumName)
      ? {
          canApproveContent: true,
          canEditPosts: true,
          canSoftDeletePosts: true,
          canRestorePosts: true,
          canOpenCloseThreads: true,
          canStickThreads: true,
          canMoveThreads: true,
          canMergeThreads: true,
          canSplitThreads: true,
        }
      : NO_MODERATOR_RIGHTS,
    passwordRequired: forumName === 'password',
    passwordSatisfied: false,
    visibility: 'visible',
  }
}

describe('F22 permission matrix', () => {
  const actorNames = Object.keys(EXPECTED) as ActorName[]

  for (const actorName of actorNames) {
    for (const forumName of Object.keys(EXPECTED[actorName]!)) {
      const allowed = new Set<F22Action>(EXPECTED[actorName]![forumName]!)

      describe(`${actorName} @ ${forumName}`, () => {
        for (const f22 of F22_ACTIONS) {
          const shouldAllow = allowed.has(f22)
          it(`${shouldAllow ? 'allows' : 'denies'} ${f22}`, async () => {
            // Fresh Authorizer per assertion keeps bypass-logging isolated.
            const authorizer = new Authorizer(source)
            const actor = ACTORS[actorName]
            const target = await buildTarget(
              authorizer,
              actor,
              actorName,
              forumName,
              f22,
            )
            expect(authorizer.can(actor, ACTION_OF[f22], target)).toBe(
              shouldAllow,
            )
          })
        }
      })
    }
  }

  it('covers every actor and context in the fixture (no silent gaps)', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(8)
    for (const actorName of actorNames) {
      expect(Object.keys(EXPECTED[actorName]!)).toHaveLength(4)
    }
    // 8 actors x 4 contexts x 19 actions. The count is spelled out rather than
    // derived so that adding an action has to be a deliberate edit here too —
    // deriving it from F22_ACTIONS.length would make the assertion agree with
    // itself no matter what the fixture says.
    const cells =
      Object.keys(EXPECTED).length *
      4 *
      F22_ACTIONS.length
    expect(cells).toBe(608)
  })

  it('every F22 action maps to a real Authorizer action', () => {
    for (const f22 of F22_ACTIONS) {
      expect(ACTION_OF[f22]).toBeDefined()
    }
    // Guards F22's own acceptance: adding a permission/action must extend both
    // the fixture and this map, or this count drifts and the suite fails.
    expect(Object.keys(ACTION_OF)).toHaveLength(19)
    void SELF_OWNED
  })
})

describe('F22 bypasses are logged (R4.2)', () => {
  it('emits a bypass event when an administrator overrides a denial', async () => {
    const events: string[] = []
    const authorizer = new Authorizer(source, {
      onBypass: (e) => events.push(`${e.kind}:${e.action}`),
    })
    const admin = ACTORS.administrator
    // The private forum denies registered members; admin gets in by bypass.
    const forum = await authorizer.forumMatrix(admin, FORUM.private)
    const ok = authorizer.can(admin, 'thread.view', {
      forumId: FORUM.private,
      forum,
    })
    expect(ok).toBe(true)
    expect(events).toContain('administrator:thread.view')
  })

  it('super-moderator bypass never grants admin-cp access', () => {
    const authorizer = new Authorizer(source)
    const superMod = ACTORS.superModerator
    expect(authorizer.can(superMod, 'admincp.access')).toBe(false)
  })
})
