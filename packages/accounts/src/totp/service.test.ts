import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryStore } from '../memory-repos'
import type { AccountStore } from '../ports'
import { rejectionMessage } from '../test-support.fixture'
import {
  clearSecondFactor,
  newRecoveryCode,
  normaliseRecoveryCode,
  RECOVERY_CODE_COUNT,
  TwoFactorService,
} from './service'
import { stepAt, totpCode } from './totp'

const KEY = 'a-board-auth-secret-0000000000000'

let store: AccountStore
let userId: number
let now: Date

function service(): TwoFactorService {
  return new TwoFactorService({
    accounts: store.accounts,
    twoFactor: store.twoFactor,
    recoveryCodes: store.recoveryCodes,
    sealingKey: KEY,
    clock: () => now,
  })
}

async function enrol(): Promise<{ secret: string; codes: readonly string[] }> {
  const { secret } = await service().beginEnrolment(userId, 'Ada’s board')
  const codes = await service().confirmEnrolment({
    userId,
    code: await totpCode(secret, stepAt(now)),
  })
  return { secret, codes }
}

beforeEach(async () => {
  store = createMemoryStore()
  now = new Date('2026-08-01T12:00:00Z')

  const account = await store.accounts.create({
    username: 'Ada',
    usernameLower: 'ada',
    email: 'ada@example.com',
    emailLower: 'ada@example.com',
    passwordHash: 'hash',
    passwordAlgo: 'argon2id',
    state: 'active',
    primaryGroupId: 2,
  })
  userId = account.id
})

describe('setting up an authenticator app', () => {
  it('hands over a secret and a URI, and asks nothing of the account yet', async () => {
    const enrolment = await service().beginEnrolment(userId, 'Ada’s board')

    expect(enrolment.secret).toMatch(/^[A-Z2-7]+$/)
    expect(enrolment.uri).toContain('otpauth://totp/')
    expect(await service().state(userId)).toEqual({
      enrolled: false,
      pending: true,
      recoveryCodesLeft: 0,
    })
  })

  it('never writes the secret where the table can be read for it', async () => {
    const enrolment = await service().beginEnrolment(userId, 'Board')
    const stored = await store.twoFactor.find(userId)

    expect(stored?.sealedSecret).not.toContain(enrolment.secret)
    expect(stored?.sealedSecret.startsWith('v1.')).toBe(true)
  })

  it('turns on only once a code proves the app holds the secret', async () => {
    const { codes } = await enrol()

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(await service().state(userId)).toEqual({
      enrolled: true,
      pending: false,
      recoveryCodesLeft: RECOVERY_CODE_COUNT,
    })
  })

  it('refuses a wrong code and stays off', async () => {
    await service().beginEnrolment(userId, 'Board')

    expect(
      await rejectionMessage(service().confirmEnrolment({ userId, code: '000000' })),
    ).toContain('not right')

    expect((await service().state(userId)).enrolled).toBe(false)
  })

  it('refuses to start again while it is already on', async () => {
    await enrol()

    expect(await rejectionMessage(service().beginEnrolment(userId, 'Board'))).toContain(
      'already asks for a code',
    )
  })

  it('forgets an enrolment that was never confirmed', async () => {
    await service().beginEnrolment(userId, 'Board')
    await service().abandonEnrolment(userId)

    expect(await store.twoFactor.find(userId)).toBeNull()
  })

  it('keeps a confirmed enrolment when asked to abandon one', async () => {
    await enrol()
    await service().abandonEnrolment(userId)

    expect((await service().state(userId)).enrolled).toBe(true)
  })
})

describe('clearing a factor an operator has been asked to break open', () => {
  it('takes the secret and the recovery codes even where a member could not', async () => {
    await enrol()

    expect(await clearSecondFactor(store, userId)).toBe(true)

    expect(await service().state(userId)).toEqual({
      enrolled: false,
      pending: false,
      recoveryCodesLeft: 0,
    })
    expect(await store.recoveryCodes.countUnused(userId)).toBe(0)
  })

  it('says so when there was nothing to clear', async () => {
    expect(await clearSecondFactor(store, userId)).toBe(false)
  })
})

describe('taking the second factor at sign-in', () => {
  it('accepts the code the app is showing', async () => {
    const { secret } = await enrol()
    now = new Date(now.getTime() + 60_000)

    expect(await service().verify({ userId, code: await totpCode(secret, stepAt(now)) })).toEqual({
      status: 'ok',
      usedRecoveryCode: false,
    })
  })

  it('refuses the same code twice, however quickly it comes back', async () => {
    const { secret } = await enrol()
    now = new Date(now.getTime() + 60_000)

    const code = await totpCode(secret, stepAt(now))
    expect((await service().verify({ userId, code })).status).toBe('ok')
    expect((await service().verify({ userId, code })).status).toBe('replayed')
  })

  it('refuses a code from an earlier step than one already spent', async () => {
    const { secret } = await enrol()
    now = new Date(now.getTime() + 60_000)

    await service().verify({ userId, code: await totpCode(secret, stepAt(now)) })

    expect(
      (await service().verify({ userId, code: await totpCode(secret, stepAt(now) - 1) })).status,
    ).toBe('replayed')
  })

  it('refuses a wrong code', async () => {
    await enrol()
    expect((await service().verify({ userId, code: '000000' })).status).toBe('wrong')
  })

  it('takes a recovery code, once', async () => {
    const { codes } = await enrol()
    const code = codes[3]!

    expect(await service().verify({ userId, code })).toEqual({
      status: 'ok',
      usedRecoveryCode: true,
    })
    expect((await service().verify({ userId, code })).status).toBe('wrong')
    expect((await service().state(userId)).recoveryCodesLeft).toBe(RECOVERY_CODE_COUNT - 1)
  })

  it('takes a recovery code however it was typed back', async () => {
    const { codes } = await enrol()

    expect(
      (await service().verify({ userId, code: codes[0]!.replace('-', '').toLowerCase() })).status,
    ).toBe('ok')
  })

  it('says wrong rather than anything else when nothing is set up', async () => {
    expect((await service().verify({ userId, code: '000000' })).status).toBe('wrong')
  })
})

describe('recovery codes', () => {
  it('are replaced as a set, retiring the ones written down before', async () => {
    const { codes } = await enrol()
    const replaced = await service().replaceRecoveryCodes(userId)

    expect(replaced).toHaveLength(RECOVERY_CODE_COUNT)
    expect(replaced).not.toEqual(codes)
    expect((await service().verify({ userId, code: codes[0]! })).status).toBe('wrong')
    expect((await service().verify({ userId, code: replaced[0]! })).status).toBe('ok')
  })

  it('are printed in a shape somebody can copy off a screen', () => {
    const code = newRecoveryCode()

    expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/)
    expect(normaliseRecoveryCode(' abc de-fghij ')).toBe('ABCDEFGHIJ')
  })
})

describe('turning it off', () => {
  it('clears the enrolment and the codes with it', async () => {
    await enrol()
    await service().disable({ userId, required: false })

    expect(await service().state(userId)).toEqual({
      enrolled: false,
      pending: false,
      recoveryCodesLeft: 0,
    })
    expect(await store.recoveryCodes.countUnused(userId)).toBe(0)
  })

  it('refuses while the board requires it of this member', async () => {
    await enrol()

    expect(await rejectionMessage(service().disable({ userId, required: true }))).toContain(
      'cannot be turned off',
    )

    expect((await service().state(userId)).enrolled).toBe(true)
  })
})

describe('when the board’s key has changed under a stored secret', () => {
  it('says so rather than failing as a wrong code', async () => {
    await enrol()

    const stranded = new TwoFactorService({
      accounts: store.accounts,
      twoFactor: store.twoFactor,
      recoveryCodes: store.recoveryCodes,
      sealingKey: 'a-different-auth-secret-000000000',
      clock: () => now,
    })

    expect(await rejectionMessage(stranded.verify({ userId, code: '000000' }))).toContain(
      'AUTH_SECRET has changed',
    )
  })
})
