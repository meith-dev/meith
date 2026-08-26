import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { hashToken } from '../crypto/tokens'
import type {
  AccountRepository,
  Clock,
  RecoveryCodeRepository,
  TwoFactorRepository,
} from '../ports'
import { encodeBase32 } from './base32'
import { openSecret, sealSecret } from './secret-box'
import { generateTotpSecret, matchTotp, otpauthUri } from './totp'

export const RECOVERY_CODE_COUNT = 10

export const RECOVERY_CODE_BYTES = 16

export const WRONG_CODE = 'That code is not right. Check your authenticator app and try again.'

export const REPLAYED_CODE =
  'That code has been used already. Wait for your authenticator app to show the next one.'

export interface TwoFactorDeps {
  readonly accounts: AccountRepository
  readonly twoFactor: TwoFactorRepository
  readonly recoveryCodes: RecoveryCodeRepository
  readonly sealingKey: string
  readonly clock?: Clock
}

export interface Enrolment {
  readonly secret: string
  readonly uri: string
}

export interface TwoFactorState {
  readonly enrolled: boolean
  readonly pending: boolean
  readonly recoveryCodesLeft: number
}

export type SecondFactorOutcome =
  | { readonly status: 'ok'; readonly usedRecoveryCode: boolean }
  | { readonly status: 'wrong' }
  | { readonly status: 'replayed' }

export async function holdsSecondFactor(
  twoFactor: TwoFactorRepository,
  userId: number,
): Promise<boolean> {
  const record = await twoFactor.find(userId)
  return record !== null && record.confirmedAt !== null
}

export async function clearSecondFactor(
  store: {
    readonly twoFactor: TwoFactorRepository
    readonly recoveryCodes: RecoveryCodeRepository
  },
  userId: number,
): Promise<boolean> {
  const removed = await store.twoFactor.remove(userId)
  await store.recoveryCodes.removeAll(userId)
  return removed
}

export class TwoFactorService {
  private readonly accounts: AccountRepository
  private readonly twoFactor: TwoFactorRepository
  private readonly recoveryCodes: RecoveryCodeRepository
  private readonly sealingKey: string
  private readonly now: Clock

  constructor(deps: TwoFactorDeps) {
    this.accounts = deps.accounts
    this.twoFactor = deps.twoFactor
    this.recoveryCodes = deps.recoveryCodes
    this.sealingKey = deps.sealingKey
    this.now = deps.clock ?? (() => new Date())
  }

  async state(userId: number): Promise<TwoFactorState> {
    const record = await this.twoFactor.find(userId)
    const enrolled = record !== null && record.confirmedAt !== null

    return {
      enrolled,
      pending: record !== null && record.confirmedAt === null,
      recoveryCodesLeft: enrolled ? await this.recoveryCodes.countUnused(userId) : 0,
    }
  }

  async isEnrolled(userId: number): Promise<boolean> {
    return holdsSecondFactor(this.twoFactor, userId)
  }

  async beginEnrolment(userId: number, boardName: string): Promise<Enrolment> {
    const account = await this.accounts.findById(userId)
    if (account === null) throw new NotFoundError(msg('error.accounts.account-longer-exists'))

    const existing = await this.twoFactor.find(userId)
    if (existing !== null && existing.confirmedAt !== null) {
      throw new ConflictError(msg('error.accounts.account-already-asks-for-code'))
    }

    const secret = generateTotpSecret()
    await this.twoFactor.startEnrolment({
      userId,
      sealedSecret: await sealSecret(secret, this.sealingKey),
      now: this.now(),
    })

    return {
      secret,
      uri: otpauthUri({ secret, account: account.username, issuer: boardName }),
    }
  }

  async pendingEnrolment(userId: number, boardName: string): Promise<Enrolment | null> {
    const record = await this.twoFactor.find(userId)
    if (record === null || record.confirmedAt !== null) return null

    const account = await this.accounts.findById(userId)
    if (account === null) return null

    const secret = await this.unseal(record.sealedSecret)
    return {
      secret,
      uri: otpauthUri({ secret, account: account.username, issuer: boardName }),
    }
  }

  async confirmEnrolment(input: {
    readonly userId: number
    readonly code: string
  }): Promise<readonly string[]> {
    const record = await this.twoFactor.find(input.userId)
    if (record === null) {
      throw new ConflictError(msg('error.accounts.start-setting-up-authenticator-app'))
    }
    if (record.confirmedAt !== null) {
      throw new ConflictError(msg('error.accounts.account-already-asks-for-code-2'))
    }

    const secret = await this.unseal(record.sealedSecret)
    const at = this.now()
    const matched = await matchTotp({ secret, code: input.code, at })

    if (matched === null) throw new ValidationError(WRONG_CODE)

    await this.twoFactor.confirm(input.userId, matched.step, at)
    return this.replaceRecoveryCodes(input.userId)
  }

  async verify(input: {
    readonly userId: number
    readonly code: string
  }): Promise<SecondFactorOutcome> {
    const record = await this.twoFactor.find(input.userId)
    if (record === null || record.confirmedAt === null) return { status: 'wrong' }

    const at = this.now()
    const matched = await matchTotp({
      secret: await this.unseal(record.sealedSecret),
      code: input.code,
      at,
    })

    if (matched !== null) {
      const fresh = await this.twoFactor.spendStep(input.userId, matched.step)
      return fresh ? { status: 'ok', usedRecoveryCode: false } : { status: 'replayed' }
    }

    const spent = await this.recoveryCodes.spend(
      input.userId,
      await hashToken(normaliseRecoveryCode(input.code)),
      at,
    )

    return spent ? { status: 'ok', usedRecoveryCode: true } : { status: 'wrong' }
  }

  async replaceRecoveryCodes(userId: number): Promise<readonly string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode())

    await this.recoveryCodes.replaceAll(
      userId,
      await Promise.all(codes.map((code) => hashToken(normaliseRecoveryCode(code)))),
      this.now(),
    )

    return codes
  }

  async disable(input: { readonly userId: number; readonly required: boolean }): Promise<void> {
    if (input.required) {
      throw new ForbiddenError(msg('error.accounts.board-asks-its-staff-for'))
    }

    await this.twoFactor.remove(input.userId)
    await this.recoveryCodes.removeAll(input.userId)
  }

  async abandonEnrolment(userId: number): Promise<void> {
    const record = await this.twoFactor.find(userId)
    if (record === null || record.confirmedAt !== null) return

    await this.twoFactor.remove(userId)
  }

  private async unseal(sealed: string): Promise<string> {
    const secret = await openSecret(sealed, this.sealingKey)
    if (secret === null) {
      throw new ForbiddenError(msg('error.accounts.board-read-secret-behind-authenticator'))
    }
    return secret
  }
}

export function enrolmentLookup(repository: TwoFactorRepository): {
  isEnrolled(userId: number): Promise<boolean>
} {
  return {
    async isEnrolled(userId: number): Promise<boolean> {
      const record = await repository.find(userId)
      return record !== null && record.confirmedAt !== null
    },
  }
}

export function newRecoveryCode(): string {
  const bytes = new Uint8Array(RECOVERY_CODE_BYTES)
  crypto.getRandomValues(bytes)

  const code = encodeBase32(bytes)
  return code.match(/.{1,5}/g)?.join('-') ?? code
}

export function normaliseRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}
