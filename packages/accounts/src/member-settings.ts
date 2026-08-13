import { ValidationError } from '@meith/core'

import { hashPassword, needsRehash, verifyPassword } from './crypto/password'
import { generateToken, hashToken } from './crypto/tokens'
import { foldIdentifier } from './case-fold'
import type {
  AccountRepository,
  CredentialTokenRepository,
  SessionRepository,
} from './ports'

export const LOCATION_MAX = 100
export const WEBSITE_MAX = 200
export const BIO_MAX = 1000

export const PAGE_SIZE_MIN = 5
export const PAGE_SIZE_MAX = 100

export const EMAIL_CHANGE_TTL_MINUTES = 60

export interface MemberSettings {
  readonly userId: number
  readonly email: string
  readonly timezone: string
  readonly postsPerPage: number | null
  readonly threadsPerPage: number | null
  readonly invisible: boolean
  readonly location: string | null
  readonly website: string | null
  readonly bio: string | null
  readonly displayGroupId: number | null
}

export interface MemberGroupChoice {
  readonly groupId: number
  readonly title: string
  readonly isPrimary: boolean
}

export interface MemberSettingsRepository {
  read(userId: number): Promise<MemberSettings | null>

  groupsHeldBy(userId: number): Promise<readonly MemberGroupChoice[]>

  saveDisplayGroup(input: {
    readonly userId: number
    readonly displayGroupId: number | null
  }): Promise<void>

  saveProfile(input: {
    readonly userId: number
    readonly location: string | null
    readonly website: string | null
    readonly bio: string | null
  }): Promise<void>

  saveOptions(input: {
    readonly userId: number
    readonly timezone: string
    readonly postsPerPage: number | null
    readonly threadsPerPage: number | null
    readonly invisible: boolean
  }): Promise<void>

  adoptEmail(input: {
    readonly userId: number
    readonly email: string
    readonly emailLower: string
  }): Promise<boolean>
}

export const AUTOMATIC_TIMEZONE = 'auto'

export function isKnownTimezone(value: string): boolean {
  if (value === 'UTC') return true

  if (!/^[A-Za-z][A-Za-z0-9_+-]*\/[A-Za-z0-9_+/-]+$/.test(value)) return false

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function isTimezonePreference(value: string): boolean {
  return value === AUTOMATIC_TIMEZONE || isKnownTimezone(value)
}

export class MemberSettingsService {
  private readonly settings: MemberSettingsRepository
  private readonly accounts: AccountRepository
  private readonly sessions: SessionRepository
  private readonly tokens: CredentialTokenRepository
  private readonly now: () => Date

  constructor(deps: {
    settings: MemberSettingsRepository
    accounts: AccountRepository
    sessions: SessionRepository
    tokens: CredentialTokenRepository
    now?: () => Date
  }) {
    this.settings = deps.settings
    this.accounts = deps.accounts
    this.sessions = deps.sessions
    this.tokens = deps.tokens
    this.now = deps.now ?? (() => new Date())
  }

  async read(userId: number): Promise<MemberSettings | null> {
    return this.settings.read(userId)
  }

  async groupsHeldBy(userId: number): Promise<readonly MemberGroupChoice[]> {
    return this.settings.groupsHeldBy(userId)
  }

  async saveDisplayGroup(input: {
    readonly userId: number
    readonly displayGroupId: string
  }): Promise<void> {
    const held = await this.settings.groupsHeldBy(input.userId)
    const primary = held.find((choice) => choice.isPrimary)

    const raw = input.displayGroupId.trim()
    if (raw === '' || (primary !== undefined && raw === String(primary.groupId))) {
      await this.settings.saveDisplayGroup({ userId: input.userId, displayGroupId: null })
      return
    }

    if (!/^[1-9]\d*$/.test(raw)) {
      throw new ValidationError('That is not a group this board has.')
    }

    const chosen = Number(raw)
    if (!held.some((choice) => choice.groupId === chosen)) {
      throw new ValidationError(
        'You can only be shown as a group you are in. If a membership has ' +
          'lapsed, so has your claim on its badge.',
      )
    }

    await this.settings.saveDisplayGroup({
      userId: input.userId,
      displayGroupId: chosen,
    })
  }

  async saveProfile(input: {
    readonly userId: number
    readonly location: string
    readonly website: string
    readonly bio: string
  }): Promise<void> {
    const location = input.location.trim()
    const bio = input.bio.trim()
    const website = input.website.trim()

    if (location.length > LOCATION_MAX) {
      throw new ValidationError(`Location may be at most ${LOCATION_MAX} characters.`)
    }
    if (bio.length > BIO_MAX) {
      throw new ValidationError(`About me may be at most ${BIO_MAX} characters.`)
    }
    if (website.length > WEBSITE_MAX) {
      throw new ValidationError(`A website address may be at most ${WEBSITE_MAX} characters.`)
    }

    await this.settings.saveProfile({
      userId: input.userId,
      location: location === '' ? null : location,
      website: website === '' ? null : normaliseWebsite(website),
      bio: bio === '' ? null : bio,
    })
  }

  async saveOptions(input: {
    readonly userId: number
    readonly timezone: string
    readonly postsPerPage: string
    readonly threadsPerPage: string
    readonly invisible: boolean
  }): Promise<void> {
    const timezone = input.timezone.trim()
    if (!isTimezonePreference(timezone)) {
      throw new ValidationError('That is not a timezone this board recognises.')
    }

    await this.settings.saveOptions({
      userId: input.userId,
      timezone,
      postsPerPage: parsePageSize(input.postsPerPage, 'Posts per page'),
      threadsPerPage: parsePageSize(input.threadsPerPage, 'Threads per page'),
      invisible: input.invisible,
    })
  }

  async changePassword(input: {
    readonly userId: number
    readonly currentPassword: string
    readonly newPassword: string
    readonly minLength: number
  }): Promise<void> {
    const account = await this.requireVerified(input.userId, input.currentPassword)

    const next = input.newPassword
    if (next.length < input.minLength) {
      throw new ValidationError(`A password must be at least ${input.minLength} characters.`)
    }
    if (next === input.currentPassword) {
      throw new ValidationError('That is the password you are already using.')
    }

    const hash = await hashPassword(next)
    await this.accounts.updatePassword(account.id, hash, 'argon2id')
    await this.sessions.revokeAllForUser(account.id)
  }

  async requestEmailChange(input: {
    readonly userId: number
    readonly currentPassword: string
    readonly newEmail: string
  }): Promise<{ token: string; email: string; expiresAt: Date }> {
    const account = await this.requireVerified(input.userId, input.currentPassword)

    const email = input.newEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('That does not look like an e-mail address.')
    }

    const emailLower = foldIdentifier(email)
    if (emailLower === account.emailLower) {
      throw new ValidationError('That is the address you are already using.')
    }

    const taken = await this.accounts.findByEmailLower(emailLower)
    if (taken !== null) {
      throw new ValidationError('That address is already in use on this board.')
    }

    const token = generateToken()
    const at = this.now()
    const expiresAt = new Date(at.getTime() + EMAIL_CHANGE_TTL_MINUTES * 60_000)

    await this.tokens.issue({
      tokenHash: await hashToken(token),
      userId: account.id,
      purpose: 'email_change',
      payload: email,
      expiresAt,
    })

    return { token, email, expiresAt }
  }

  async confirmEmailChange(token: string): Promise<{ email: string } | null> {
    const consumed = await this.tokens.consume(await hashToken(token), 'email_change', this.now())
    if (consumed === null || consumed.payload === null) return null

    const email = consumed.payload
    const adopted = await this.settings.adoptEmail({
      userId: consumed.userId,
      email,
      emailLower: foldIdentifier(email),
    })

    return adopted ? { email } : null
  }

  private async requireVerified(userId: number, currentPassword: string) {
    const account = await this.accounts.findById(userId)
    if (account === null) throw new ValidationError('That account does not exist.')

    if (account.passwordHash === null) {
      throw new ValidationError(
        'This account has no password set, so it cannot be changed here.',
      )
    }

    const ok = await verifyPassword(currentPassword, account.passwordHash)
    if (!ok) throw new ValidationError('That is not your current password.')

    void needsRehash

    return account
  }
}

function parsePageSize(raw: string, label: string): number | null {
  const value = raw.trim()
  if (value === '') return null

  if (!/^[1-9]\d*$/.test(value)) {
    throw new ValidationError(`${label} must be a number.`)
  }
  const size = Number(value)
  if (!Number.isSafeInteger(size) || size < PAGE_SIZE_MIN || size > PAGE_SIZE_MAX) {
    throw new ValidationError(
      `${label} must be between ${PAGE_SIZE_MIN} and ${PAGE_SIZE_MAX}.`,
    )
  }
  return size
}

function normaliseWebsite(value: string): string {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new ValidationError('That does not look like a web address.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('A website address must start with http:// or https://.')
  }
  return url.toString()
}
