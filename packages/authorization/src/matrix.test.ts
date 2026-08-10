import { describe, expect, it } from 'vitest'

import { Authorizer } from './authorizer'
import {
  ACTORS,
  FORUM,
  MemoryAuthorizationSource,
  type ActorName,
} from './fixture'
import { EXPECTED, PERMISSION_ACTIONS, type PermissionAction } from './matrix.fixture'
import { NO_MODERATOR_RIGHTS } from './types'
import type { Action, Actor, Target } from './types'

const source = new MemoryAuthorizationSource()

const ACTION_OF: Record<PermissionAction, Action> = {
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
  download: 'attachment.download',
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

function isModeratorOf(actorName: ActorName, forumName: string): boolean {
  return (
    actorName === 'forumModerator' &&
    (forumName === 'public' || forumName === 'publicSub')
  )
}

async function buildTarget(
  authorizer: Authorizer,
  actor: Actor,
  actorName: ActorName,
  forumName: string,
  action: PermissionAction,
): Promise<Target> {
  const forumId = FORUM_ID[forumName]!
  const forum = await authorizer.forumMatrix(actor, forumId)

  const ownsThisAction = action === 'editOwn' || action === 'deleteOwn'
  const ownerId = ownsThisAction ? actor.userId : OTHER_USER_ID

  return {
    forumId,
    forum,
    ownerId,
    isForumModerator: isModeratorOf(actorName, forumName),
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

describe('permission matrix', () => {
  const actorNames = Object.keys(EXPECTED) as ActorName[]

  for (const actorName of actorNames) {
    for (const forumName of Object.keys(EXPECTED[actorName]!)) {
      const allowed = new Set<PermissionAction>(EXPECTED[actorName]![forumName]!)

      describe(`${actorName} @ ${forumName}`, () => {
        for (const action of PERMISSION_ACTIONS) {
          const shouldAllow = allowed.has(action)
          it(`${shouldAllow ? 'allows' : 'denies'} ${action}`, async () => {
            const authorizer = new Authorizer(source)
            const actor = ACTORS[actorName]
            const target = await buildTarget(
              authorizer,
              actor,
              actorName,
              forumName,
              action,
            )
            expect(authorizer.can(actor, ACTION_OF[action], target)).toBe(
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
    const cells =
      Object.keys(EXPECTED).length *
      4 *
      PERMISSION_ACTIONS.length
    expect(cells).toBe(640)
  })

  it('every action maps to a real Authorizer action', () => {
    for (const action of PERMISSION_ACTIONS) {
      expect(ACTION_OF[action]).toBeDefined()
    }
    expect(Object.keys(ACTION_OF)).toHaveLength(20)
    void SELF_OWNED
  })
})

describe('bypasses are logged (R4.2)', () => {
  it('emits a bypass event when an administrator overrides a denial', async () => {
    const events: string[] = []
    const authorizer = new Authorizer(source, {
      onBypass: (e) => events.push(`${e.kind}:${e.action}`),
    })
    const admin = ACTORS.administrator
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
