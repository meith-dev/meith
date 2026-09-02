import { ConflictError, ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { foldIdentifier } from '../case-fold'
import type {
  AccountRecord,
  AccountRepository,
  Clock,
  UserIdentityRecord,
  UserIdentityRepository,
} from '../ports'
import type { IdentityService, LoginResult, RequestContext } from '../service'
import type { IdentityProvider, ProviderProfile } from './types'

export interface FederationDeps {
  readonly identity: IdentityService
  readonly accounts: AccountRepository
  readonly identities: UserIdentityRepository
  readonly clock?: Clock
}

export interface CompleteSignInInput {
  readonly provider: IdentityProvider
  readonly profile: ProviderProfile
  readonly context?: RequestContext
  readonly beforeProvision?: () => Promise<void>
}

export type FederationOutcome =
  | {
      readonly status: 'signed-in'
      readonly account: AccountRecord
      readonly login: LoginResult
      readonly created: boolean
    }
  | {
      readonly status: 'second-factor'
      readonly account: AccountRecord
      readonly token: string
      readonly expiresAt: Date
    }
  | {
      readonly status: 'pending'
      readonly account: AccountRecord
      readonly verificationToken: string | null
    }

export const UNLINK_LAST_CREDENTIAL =
  'That is the only way you have left to sign in. Set a password first, then unlink it.'

export class FederationService {
  private readonly identity: IdentityService
  private readonly accounts: AccountRepository
  private readonly identities: UserIdentityRepository
  private readonly now: Clock

  constructor(deps: FederationDeps) {
    this.identity = deps.identity
    this.accounts = deps.accounts
    this.identities = deps.identities
    this.now = deps.clock ?? (() => new Date())
  }

  async completeSignIn(input: CompleteSignInInput): Promise<FederationOutcome> {
    const context = input.context ?? {}
    const linked = await this.identities.findBySubject(input.provider.id, input.profile.subject)

    if (linked !== null) {
      const account = await this.accounts.findById(linked.userId)
      if (account === null) {
        throw new ForbiddenError(
          `The account behind that ${input.provider.label} sign-in no longer exists.`,
        )
      }

      await this.identities.markUsed(linked.id, this.now())
      return this.begin(account, context, false)
    }

    const email = normalisedEmail(input.profile)
    const existing =
      email === null ? null : await this.accounts.findByEmailLower(foldIdentifier(email))

    if (existing !== null) {
      if (!input.profile.emailVerified) {
        throw new ForbiddenError(
          `An account here already uses that address, and ${input.provider.label} has not ` +
            'confirmed it belongs to you. Sign in with your password and link the two from ' +
            'your account security page.',
        )
      }

      await this.link({
        userId: existing.id,
        provider: input.provider,
        profile: input.profile,
      })
      return this.begin(existing, context, false)
    }

    if (email === null) {
      throw new ValidationError(
        `${input.provider.label} did not share a confirmed e-mail address, so there is ` +
          'nothing to register an account against. Register with a password instead.',
      )
    }

    await input.beforeProvision?.()

    const provisioned = await this.identity.provisionFederated(
      {
        username: suggestedUsername(input.profile, email),
        email,
        emailVerified: input.profile.emailVerified,
      },
      context,
    )

    await this.link({
      userId: provisioned.account.id,
      provider: input.provider,
      profile: input.profile,
    })

    if (provisioned.account.state !== 'active') {
      return {
        status: 'pending',
        account: provisioned.account,
        verificationToken: provisioned.verificationToken ?? null,
      }
    }

    return this.begin(provisioned.account, context, true)
  }

  private async begin(
    account: AccountRecord,
    context: RequestContext,
    created: boolean,
  ): Promise<FederationOutcome> {
    const outcome = await this.identity.beginSessionFor(account, context)

    if (outcome.status === 'second-factor') {
      return {
        status: 'second-factor',
        account,
        token: outcome.token,
        expiresAt: outcome.expiresAt,
      }
    }

    return { status: 'signed-in', account, login: outcome.login, created }
  }

  async linkToViewer(input: {
    readonly userId: number
    readonly provider: IdentityProvider
    readonly profile: ProviderProfile
  }): Promise<UserIdentityRecord> {
    const linked = await this.identities.findBySubject(input.provider.id, input.profile.subject)

    if (linked !== null && linked.userId !== input.userId) {
      throw new ConflictError(
        `That ${input.provider.label} account is already linked to another member here.`,
      )
    }

    return linked ?? this.link(input)
  }

  async unlink(input: {
    readonly userId: number
    readonly identityId: number
    readonly hasPassword: boolean
    readonly usablePasskeys: number
    readonly usableProviders: readonly string[]
  }): Promise<void> {
    const remaining = (await this.identities.listForUser(input.userId)).filter(
      (identity) =>
        identity.id !== input.identityId && input.usableProviders.includes(identity.provider),
    )

    if (!input.hasPassword && input.usablePasskeys === 0 && remaining.length === 0) {
      throw new ForbiddenError(UNLINK_LAST_CREDENTIAL)
    }

    const removed = await this.identities.unlink(input.userId, input.identityId)
    if (!removed) {
      throw new ConflictError(msg('error.accounts.sign-in-already-unlinked'))
    }
  }

  private async link(input: {
    readonly userId: number
    readonly provider: IdentityProvider
    readonly profile: ProviderProfile
  }): Promise<UserIdentityRecord> {
    return this.identities.link({
      userId: input.userId,
      provider: input.provider.id,
      subject: input.profile.subject,
      label: input.profile.username ?? input.profile.email ?? input.profile.displayName,
      now: this.now(),
    })
  }
}

function normalisedEmail(profile: ProviderProfile): string | null {
  const email = profile.email?.trim() ?? ''
  return email === '' ? null : email
}

function suggestedUsername(profile: ProviderProfile, email: string): string {
  const local = email.split('@')[0] ?? ''
  return profile.username ?? profile.displayName ?? local
}
