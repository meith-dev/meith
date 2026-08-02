/** F53 — the warning rules, without a database. */
import { describe, expect, it } from 'vitest'
import { ValidationError } from '@forum/core'

import {
  WarningService,
  parseWarningAction,
  restrictsPosting,
  type PostingRestriction,
  type WarningLevel,
  type WarningPage,
  type WarningRepository,
  type WarningType,
} from './warnings'

const NOW = new Date('2026-07-31T12:00:00Z')
const DAY = 86_400_000

const TYPES: WarningType[] = [
  { id: 1, title: 'Spamming', points: 2, expiryDays: 90 },
  { id: 2, title: 'Advertising', points: 3, expiryDays: null },
]

const LEVELS: WarningLevel[] = [
  { points: 4, action: 'moderate_posting', durationDays: 30 },
  { points: 7, action: 'suspend_posting', durationDays: 14 },
  { points: 10, action: 'ban', durationDays: null },
]

class FakeWarnings implements WarningRepository {
  types = TYPES
  levels = LEVELS
  /**
   * The total *after* the change — what `issue` and `revoke` report.
   *
   * Separate from `pointsBefore` because the service reads the standing on
   * both sides of an issue to work out whether a level was *newly* reached, and
   * a fake that returns one number for both cannot tell the two apart. Two
   * fields is what makes the double-issue test mean anything.
   */
  points = 0
  /** The total *before*, which is what `pointsFor` answers. */
  pointsBefore = 0
  warnable: { id: number; username: string } | null = { id: 5, username: 'ivan' }
  postAuthor: number | null = 5
  revokeResult: { userId: number; points: number } | null = { userId: 5, points: 0 }
  due: { expired: number; userIds: readonly number[] } = { expired: 0, userIds: [] }

  readonly issued: unknown[] = []
  readonly restrictions: Array<{ userId: number; restriction: PostingRestriction }> = []

  async listTypes(): Promise<readonly WarningType[]> {
    return this.types
  }
  async listLevels(): Promise<readonly WarningLevel[]> {
    return this.levels
  }
  async findType(typeId: number): Promise<WarningType | null> {
    return this.types.find((t) => t.id === typeId) ?? null
  }
  async findWarnable(): Promise<{ id: number; username: string } | null> {
    return this.warnable
  }
  async findPostAuthor(): Promise<number | null> {
    return this.postAuthor
  }
  async issue(input: unknown): Promise<{ warningId: number; points: number }> {
    this.issued.push(input)
    return { warningId: 100, points: this.points }
  }
  async revoke(): Promise<{ userId: number; points: number } | null> {
    return this.revokeResult
  }
  async pointsFor(): Promise<number> {
    return this.pointsBefore
  }
  async readRestriction(): Promise<PostingRestriction> {
    return { suspendedUntil: null, moderatedUntil: null }
  }
  async applyRestriction(input: {
    userId: number
    restriction: PostingRestriction
  }): Promise<void> {
    this.restrictions.push({ userId: input.userId, restriction: input.restriction })
  }
  async history(): Promise<WarningPage> {
    return { rows: [] }
  }
  async expireDue(): Promise<{ expired: number; userIds: readonly number[] }> {
    return this.due
  }
}

class FakeBans {
  readonly banned: Array<{ userId: number; expiresAt?: Date | undefined }> = []
  async ban(input: { userId: number; expiresAt?: Date | undefined }): Promise<void> {
    this.banned.push(input)
  }
}

function serviceFor(warnings: FakeWarnings, bans: FakeBans | null = null): WarningService {
  return new WarningService({ warnings, bans, now: () => NOW })
}

const ISSUE = {
  userId: 5,
  actorUserId: 9,
  typeId: 1,
  reason: 'Posting the same link in four threads.',
  mayWarn: true,
}

describe('issuing', () => {
  it('takes the points and expiry from the type, never from the form', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 2

    await serviceFor(warnings).issue({ ...ISSUE, points: 99, title: 'Hacked' })

    expect(warnings.issued[0]).toMatchObject({
      title: 'Spamming',
      points: 2,
      /* 90 days from now, not "never" and not 99 of anything. */
      expiresAt: new Date(NOW.getTime() + 90 * DAY),
    })
  })

  it('accepts a free-text warning when no type is chosen', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 5

    const outcome = await serviceFor(warnings).issue({
      ...ISSUE,
      typeId: null,
      title: 'Editing a moderator note',
      points: 5,
    })

    expect(warnings.issued[0]).toMatchObject({
      title: 'Editing a moderator note',
      points: 5,
      /* A free-text warning has no configured expiry, so it has none. */
      expiresAt: null,
    })
    expect(outcome.points).toBe(5)
  })

  it('refuses a free-text warning with no title or impossible points', async () => {
    const warnings = new FakeWarnings()
    const service = serviceFor(warnings)

    for (const over of [
      { typeId: null, points: 3 },
      { typeId: null, title: 'Something', points: 0 },
      { typeId: null, title: 'Something', points: 101 },
    ] as const) {
      await expect(service.issue({ ...ISSUE, ...over })).rejects.toBeInstanceOf(ValidationError)
    }
    expect(warnings.issued).toEqual([])
  })

  it('refuses a type that does not exist', async () => {
    const warnings = new FakeWarnings()
    await expect(
      serviceFor(warnings).issue({ ...ISSUE, typeId: 999 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses without the permission, and refuses a deleted account', async () => {
    const warnings = new FakeWarnings()
    await expect(
      serviceFor(warnings).issue({ ...ISSUE, mayWarn: false }),
    ).rejects.toBeInstanceOf(ValidationError)

    warnings.warnable = null
    await expect(serviceFor(warnings).issue(ISSUE)).rejects.toBeInstanceOf(ValidationError)
    expect(warnings.issued).toEqual([])
  })

  /* The level actions include a ban, so this is a way to lock yourself out. */
  it('refuses to warn yourself', async () => {
    const warnings = new FakeWarnings()
    await expect(
      serviceFor(warnings).issue({ ...ISSUE, userId: 9, actorUserId: 9 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('needs a reason', async () => {
    const warnings = new FakeWarnings()
    await expect(
      serviceFor(warnings).issue({ ...ISSUE, reason: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('levels', () => {
  it('applies nothing below the first threshold', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 3

    const outcome = await serviceFor(warnings).issue(ISSUE)

    expect(outcome.triggered).toBeNull()
    expect(warnings.restrictions.at(-1)!.restriction).toEqual({
      suspendedUntil: null,
      moderatedUntil: null,
    })
  })

  it('holds posts at the first threshold, for the level"s stated duration', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 4

    const outcome = await serviceFor(warnings).issue(ISSUE)

    expect(outcome.triggered).toMatchObject({ action: 'moderate_posting' })
    expect(warnings.restrictions.at(-1)!.restriction).toEqual({
      suspendedUntil: null,
      moderatedUntil: new Date(NOW.getTime() + 30 * DAY),
    })
  })

  /* Thresholds, not steps: the *highest* one reached applies. */
  it('applies the highest threshold reached, skipping the ones jumped over', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 8

    const outcome = await serviceFor(warnings).issue(ISSUE)

    expect(outcome.triggered).toMatchObject({ action: 'suspend_posting' })
    expect(warnings.restrictions.at(-1)!.restriction.suspendedUntil).toEqual(
      new Date(NOW.getTime() + 14 * DAY),
    )
    expect(warnings.restrictions.at(-1)!.restriction.moderatedUntil).toBeNull()
  })

  it('bans at the ban threshold, through the ban service rather than a column', async () => {
    const warnings = new FakeWarnings()
    const bans = new FakeBans()
    warnings.points = 12

    await serviceFor(warnings, bans).issue(ISSUE)

    expect(bans.banned).toHaveLength(1)
    expect(bans.banned[0]).toMatchObject({ userId: 5, bannedByUserId: 9 })
    /* `durationDays: null` means nobody set an end date, so none is passed. */
    expect('expiresAt' in bans.banned[0]!).toBe(false)
    /* A ban is not a posting restriction; F23 owns the whole lockout. */
    expect(warnings.restrictions.at(-1)!.restriction).toEqual({
      suspendedUntil: null,
      moderatedUntil: null,
    })
  })

  /*
   * The double-issue trap. Two warnings in a minute that both leave the member
   * at the suspend level must not extend the suspension to twenty-eight days.
   */
  it('does not re-apply a level the member was already at', async () => {
    const warnings = new FakeWarnings()
    const bans = new FakeBans()
    warnings.pointsBefore = 0
    warnings.points = 12

    await serviceFor(warnings, bans).issue(ISSUE)
    expect(bans.banned).toHaveLength(1)

    warnings.pointsBefore = 12
    warnings.points = 14
    const second = await serviceFor(warnings, bans).issue(ISSUE)

    expect(second.triggered).toBeNull()
    expect(bans.banned).toHaveLength(1)
  })

  it('carries on when the member is already banned', async () => {
    const warnings = new FakeWarnings()
    const bans = {
      async ban(): Promise<void> {
        throw new Error('already banned')
      },
    }
    warnings.points = 12

    /* The warning is still recorded; the punishment was already in force. */
    const outcome = await new WarningService({ warnings, bans, now: () => NOW }).issue(ISSUE)
    expect(outcome.points).toBe(12)
  })

  it('never bans on a revocation, which only lowers points', async () => {
    const warnings = new FakeWarnings()
    const bans = new FakeBans()
    warnings.revokeResult = { userId: 5, points: 12 }

    await serviceFor(warnings, bans).revoke({
      warningId: 100,
      actorUserId: 9,
      reason: 'Wrong member.',
      mayWarn: true,
    })

    expect(bans.banned).toEqual([])
  })
})

describe('revoking', () => {
  /* The whole reason the total is derived: the restriction has to lift too. */
  it('lifts the restriction when the revocation drops the member below the level', async () => {
    const warnings = new FakeWarnings()
    warnings.revokeResult = { userId: 5, points: 2 }

    const standing = await serviceFor(warnings).revoke({
      warningId: 100,
      actorUserId: 9,
      reason: 'Issued twice by mistake.',
      mayWarn: true,
    })

    expect(standing).toMatchObject({ userId: 5, points: 2, level: null })
    expect(warnings.restrictions.at(-1)!.restriction).toEqual({
      suspendedUntil: null,
      moderatedUntil: null,
    })
  })

  it('leaves a restriction in place when the member is still above a threshold', async () => {
    const warnings = new FakeWarnings()
    warnings.revokeResult = { userId: 5, points: 5 }

    await serviceFor(warnings).revoke({
      warningId: 100,
      actorUserId: 9,
      reason: 'One of three was wrong.',
      mayWarn: true,
    })

    expect(warnings.restrictions.at(-1)!.restriction.moderatedUntil).not.toBeNull()
  })

  it('reports an already-revoked warning as null rather than as an error', async () => {
    const warnings = new FakeWarnings()
    warnings.revokeResult = null

    expect(
      await serviceFor(warnings).revoke({
        warningId: 100,
        actorUserId: 9,
        reason: '',
        mayWarn: true,
      }),
    ).toBeNull()
    expect(warnings.restrictions).toEqual([])
  })

  it('refuses without the permission', async () => {
    const warnings = new FakeWarnings()
    await expect(
      serviceFor(warnings).revoke({
        warningId: 100,
        actorUserId: 9,
        reason: '',
        mayWarn: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('expiry', () => {
  /*
   * The task's real job. Warnings lapsing is already expressed by the live
   * predicate; what the sweep adds is re-evaluating the *level*, which is how a
   * suspension ends when the warning behind it ages out.
   */
  it('re-evaluates every member whose warnings lapsed', async () => {
    const warnings = new FakeWarnings()
    warnings.due = { expired: 3, userIds: [5, 6] }
    warnings.pointsBefore = 1

    expect(await serviceFor(warnings).expireDue()).toBe(3)

    expect(warnings.restrictions.map((r) => r.userId)).toEqual([5, 6])
    for (const applied of warnings.restrictions) {
      expect(applied.restriction).toEqual({ suspendedUntil: null, moderatedUntil: null })
    }
  })

  it('leaves a member still above a threshold restricted', async () => {
    const warnings = new FakeWarnings()
    warnings.due = { expired: 1, userIds: [5] }
    warnings.pointsBefore = 8

    await serviceFor(warnings).expireDue()

    expect(warnings.restrictions.at(-1)!.restriction.suspendedUntil).not.toBeNull()
  })

  it('never bans from the sweep, which has no actor to attribute it to', async () => {
    const warnings = new FakeWarnings()
    const bans = new FakeBans()
    warnings.due = { expired: 1, userIds: [5] }
    warnings.pointsBefore = 12

    await serviceFor(warnings, bans).expireDue()

    expect(bans.banned).toEqual([])
  })
})

describe('restrictsPosting', () => {
  it('is false for absent restrictions', () => {
    expect(restrictsPosting({ suspendedUntil: null, moderatedUntil: null }, NOW)).toEqual({
      suspended: false,
      moderated: false,
    })
  })

  /* A timestamp in the past is a lapsed restriction; nothing has to sweep it. */
  it('is false for a restriction whose date has passed', () => {
    expect(
      restrictsPosting(
        {
          suspendedUntil: new Date(NOW.getTime() - 1),
          moderatedUntil: new Date(NOW.getTime() - DAY),
        },
        NOW,
      ),
    ).toEqual({ suspended: false, moderated: false })
  })

  it('is true while it is in force', () => {
    expect(
      restrictsPosting(
        { suspendedUntil: new Date(NOW.getTime() + DAY), moderatedUntil: null },
        NOW,
      ),
    ).toEqual({ suspended: true, moderated: false })
  })
})

describe('telling the member (F55)', () => {
  /** The one verb F55 exposes to this package, recorded rather than performed. */
  function recordingNotifier() {
    const told: unknown[] = []
    return {
      told,
      warned: async (input: unknown) => {
        told.push(input)
      },
    }
  }

  it('reports the warning, the new total and the restriction it applied', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 7
    const notifier = recordingNotifier()

    await new WarningService({ warnings, notifier, now: () => NOW }).issue(ISSUE)

    expect(notifier.told).toEqual([
      {
        userId: 5,
        title: 'Spamming',
        points: 2,
        totalPoints: 7,
        reason: ISSUE.reason,
        /* Seven points reaches the suspension threshold in LEVELS. */
        restriction: 'suspend_posting',
      },
    ])
  })

  it('reports no restriction when no threshold was newly reached', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 2
    const notifier = recordingNotifier()

    await new WarningService({ warnings, notifier, now: () => NOW }).issue(ISSUE)

    expect(notifier.told).toMatchObject([{ restriction: null }])
  })

  it('issues the warning anyway when the notification fails', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 2

    const outcome = await new WarningService({
      warnings,
      notifier: {
        warned: async () => {
          throw new Error('notifications table is unavailable')
        },
      },
      now: () => NOW,
    }).issue(ISSUE)

    /*
     * The warning, its points and its restriction are all committed by the time
     * anybody is told, so a throw here would report a successful moderator
     * action as a failed one — and there would be nothing to undo.
     */
    expect(outcome.points).toBe(2)
    expect(warnings.issued).toHaveLength(1)
  })

  it('tells nobody on a board with no notification store', async () => {
    const warnings = new FakeWarnings()
    warnings.points = 2

    /* No notifier: F53 predates F55 and must keep working without it. */
    await expect(serviceFor(warnings).issue(ISSUE)).resolves.toMatchObject({ points: 2 })
  })
})

describe('parseWarningAction', () => {
  it('accepts the three known actions and nothing else', () => {
    expect(parseWarningAction('ban')).toBe('ban')
    expect(parseWarningAction('suspend_posting')).toBe('suspend_posting')
    expect(parseWarningAction('moderate_posting')).toBe('moderate_posting')
    /* Configuration outlives code; an unknown action is dropped, not guessed. */
    expect(parseWarningAction('delete_account')).toBeNull()
    expect(parseWarningAction('')).toBeNull()
  })
})
