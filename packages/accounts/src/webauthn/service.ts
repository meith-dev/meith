import { ConflictError, ForbiddenError, NotFoundError } from '@meith/core'
import { msg } from '@meith/i18n'

import { encodeBase64Url, randomBase64Url } from '../crypto/base64url'
import type {
  AccountRecord,
  AccountRepository,
  Clock,
  PasskeyRecord,
  PasskeyRepository,
  UserIdentityRepository,
} from '../ports'
import type { IdentityService, LoginResult, RequestContext } from '../service'
import { SUPPORTED_ALGORITHMS } from './cose'
import type { AssertionResponse, RegistrationResponse } from './verify'
import { type RelyingParty, verifyAssertion, verifyRegistration } from './verify'

export const PASSKEY_LABEL_MAX = 60

export const PASSKEY_LIMIT = 20

export const CHALLENGE_BYTES = 32

export const REMOVE_LAST_CREDENTIAL =
  'That is the only way you have left to sign in. Set a password first, then remove it.'

export interface PasskeyDeps {
  readonly identity: IdentityService
  readonly accounts: AccountRepository
  readonly passkeys: PasskeyRepository
  readonly identities?: UserIdentityRepository
  readonly clock?: Clock
}

export interface PasskeyRegistrationOptions {
  readonly challenge: string
  readonly rp: { readonly id: string; readonly name: string }
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string }
  readonly pubKeyCredParams: readonly { readonly type: 'public-key'; readonly alg: number }[]
  readonly excludeCredentials: readonly {
    readonly type: 'public-key'
    readonly id: string
  }[]
  readonly authenticatorSelection: {
    readonly residentKey: 'preferred'
    readonly userVerification: 'preferred'
  }
  readonly timeout: number
  readonly attestation: 'none'
}

export interface PasskeyAssertionOptions {
  readonly challenge: string
  readonly rpId: string
  readonly userVerification: 'preferred'
  readonly timeout: number
  readonly allowCredentials?: readonly {
    readonly type: 'public-key'
    readonly id: string
  }[]
}

const TIMEOUT_MS = 120_000

export function newChallenge(): string {
  return randomBase64Url(CHALLENGE_BYTES)
}

export class PasskeyService {
  private readonly identity: IdentityService
  private readonly accounts: AccountRepository
  private readonly passkeys: PasskeyRepository
  private readonly identities: UserIdentityRepository | undefined
  private readonly now: Clock

  constructor(deps: PasskeyDeps) {
    this.identity = deps.identity
    this.accounts = deps.accounts
    this.passkeys = deps.passkeys
    this.identities = deps.identities
    this.now = deps.clock ?? (() => new Date())
  }

  async registrationOptions(input: {
    readonly userId: number
    readonly challenge: string
    readonly relyingParty: RelyingParty
    readonly boardName: string
  }): Promise<PasskeyRegistrationOptions> {
    const account = await this.accounts.findById(input.userId)
    if (account === null) throw new NotFoundError(msg('error.accounts.account-longer-exists'))

    const existing = await this.passkeys.listForUser(input.userId)
    if (existing.length >= PASSKEY_LIMIT) {
      throw new ConflictError(
        `An account may hold ${PASSKEY_LIMIT} passkeys. Remove one before adding another.`,
      )
    }

    return {
      challenge: input.challenge,
      rp: { id: input.relyingParty.id, name: input.boardName },
      user: {
        id: userHandle(account.id),
        name: account.username,
        displayName: account.username,
      },
      pubKeyCredParams: SUPPORTED_ALGORITHMS.map((alg) => ({ type: 'public-key', alg })),
      excludeCredentials: existing.map((passkey) => ({
        type: 'public-key',
        id: passkey.credentialId,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      timeout: TIMEOUT_MS,
      attestation: 'none',
    }
  }

  assertionOptions(input: {
    readonly challenge: string
    readonly relyingParty: RelyingParty
    readonly allowCredentials?: readonly string[]
  }): PasskeyAssertionOptions {
    return {
      challenge: input.challenge,
      rpId: input.relyingParty.id,
      userVerification: 'preferred',
      timeout: TIMEOUT_MS,
      ...(input.allowCredentials === undefined
        ? {}
        : {
            allowCredentials: input.allowCredentials.map((id) => ({
              type: 'public-key' as const,
              id,
            })),
          }),
    }
  }

  async enrol(input: {
    readonly userId: number
    readonly label: string
    readonly response: RegistrationResponse
    readonly expectedChallenge: string
    readonly relyingParty: RelyingParty
  }): Promise<PasskeyRecord> {
    const verified = await verifyRegistration({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      relyingParty: input.relyingParty,
    })

    const claimed = await this.passkeys.findByCredentialId(verified.credentialId)
    if (claimed !== null) {
      throw new ConflictError(msg('error.accounts.passkey-already-registered-here'))
    }

    return this.passkeys.create({
      userId: input.userId,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      signCount: verified.signCount,
      label: passkeyLabel(input.label),
      transports:
        input.response.transports === undefined || input.response.transports.length === 0
          ? null
          : input.response.transports.join(','),
      now: this.now(),
    })
  }

  async authenticate(input: {
    readonly credentialId: string
    readonly response: AssertionResponse
    readonly expectedChallenge: string
    readonly relyingParty: RelyingParty
    readonly context?: RequestContext
  }): Promise<{ readonly account: AccountRecord; readonly login: LoginResult }> {
    const passkey = await this.passkeys.findByCredentialId(input.credentialId)
    if (passkey === null) {
      throw new ForbiddenError(msg('error.accounts.passkey-registered-board'))
    }

    const verified = await verifyAssertion({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      relyingParty: input.relyingParty,
      publicKey: passkey.publicKey,
      storedSignCount: passkey.signCount,
    })

    const account = await this.accounts.findById(passkey.userId)
    if (account === null) {
      throw new ForbiddenError(msg('error.accounts.account-behind-passkey-longer-exists'))
    }

    if (!(await this.passkeys.markUsed(passkey.id, verified.signCount, this.now()))) {
      throw new ForbiddenError(msg('error.accounts.passkey-replayed-counter-board-already'))
    }

    const login = await this.identity.startSessionFor(account, input.context ?? {})

    return { account, login }
  }

  async proveOwnership(input: {
    readonly userId: number
    readonly credentialId: string
    readonly response: AssertionResponse
    readonly expectedChallenge: string
    readonly relyingParty: RelyingParty
  }): Promise<boolean> {
    const passkey = await this.passkeys.findByCredentialId(input.credentialId)
    if (passkey === null || passkey.userId !== input.userId) return false

    const verified = await verifyAssertion({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      relyingParty: input.relyingParty,
      publicKey: passkey.publicKey,
      storedSignCount: passkey.signCount,
    })

    return this.passkeys.markUsed(passkey.id, verified.signCount, this.now())
  }

  async remove(input: {
    readonly userId: number
    readonly passkeyId: number
    readonly hasPassword: boolean
    readonly usableProviders?: readonly string[]
  }): Promise<void> {
    const remaining = (await this.passkeys.listForUser(input.userId)).filter(
      (passkey) => passkey.id !== input.passkeyId,
    )

    const usable = input.usableProviders ?? []
    const links =
      this.identities === undefined
        ? []
        : (await this.identities.listForUser(input.userId)).filter((identity) =>
            usable.includes(identity.provider),
          )

    if (!input.hasPassword && remaining.length === 0 && links.length === 0) {
      throw new ForbiddenError(REMOVE_LAST_CREDENTIAL)
    }

    const removed = await this.passkeys.remove(input.userId, input.passkeyId)
    if (!removed) throw new NotFoundError(msg('error.accounts.passkey-already-removed'))
  }
}

export function passkeyLabel(raw: string): string {
  const trimmed = raw.replace(/\s+/gu, ' ').trim()
  if (trimmed === '') return 'Passkey'
  return [...trimmed].slice(0, PASSKEY_LABEL_MAX).join('')
}

function userHandle(userId: number): string {
  return encodeBase64Url(new TextEncoder().encode(`u${userId}`))
}
