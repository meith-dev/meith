import { ValidationError } from '@meith/core'
import { msg, normaliseLocale } from '@meith/i18n'

import { foldIdentifier } from './case-fold'
import { hashPassword, needsRehash, verifyPassword } from './crypto/password'
import { generateToken, hashToken } from './crypto/tokens'
import type {
  AccountRepository,
  CredentialTokenRepository,
  RememberTokenRepository,
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
  readonly locale: string
  readonly postsPerPage: number | null
  readonly threadsPerPage: number | null
  readonly invisible: boolean
  readonly location: string | null
  readonly website: string | null
  readonly bio: string | null
  readonly displayGroupId: number | null
  readonly massMailOptInAt: Date | null
}

export interface MemberGroupChoice {
  readonly groupId: number
  readonly title: string
  readonly isPrimary: boolean
  readonly isStaff: boolean
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
    readonly locale: string
    readonly postsPerPage: number | null
    readonly threadsPerPage: number | null
    readonly invisible: boolean
  }): Promise<void>

  saveMassMailOptIn(input: { readonly userId: number; readonly optIn: boolean }): Promise<void>

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

export const AUTOMATIC_LOCALE = 'auto'

export function isLocalePreference(value: string): boolean {
  return value === AUTOMATIC_LOCALE || normaliseLocale(value) !== null
}

export class MemberSettingsService {
  private readonly settings: MemberSettingsRepository
  private readonly accounts: AccountRepository
  private readonly sessions: SessionRepository
  private readonly remember: RememberTokenRepository
  private readonly tokens: CredentialTokenRepository
  private readonly now: () => Date

  constructor(deps: {
    settings: MemberSettingsRepository
    accounts: AccountRepository
    sessions: SessionRepository
    remember: RememberTokenRepository
    tokens: CredentialTokenRepository
    now?: () => Date
  }) {
    this.settings = deps.settings
    this.accounts = deps.accounts
    this.sessions = deps.sessions
    this.remember = deps.remember
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

    if (primary?.isStaff === true) {
      throw new ValidationError(msg('error.accounts.group-one-were-appointed-shown'))
    }

    const raw = input.displayGroupId.trim()
    if (raw === '' || (primary !== undefined && raw === String(primary.groupId))) {
      await this.settings.saveDisplayGroup({ userId: input.userId, displayGroupId: null })
      return
    }

    if (!/^[1-9]\d*$/.test(raw)) {
      throw new ValidationError(msg('error.accounts.group-board'))
    }

    const chosen = Number(raw)
    if (!held.some((choice) => choice.groupId === chosen)) {
      throw new ValidationError(msg('error.accounts.only-shown-as-group-if'))
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
      throw new ValidationError(msg('error.accounts.location-length', { max: LOCATION_MAX }))
    }
    if (bio.length > BIO_MAX) {
      throw new ValidationError(msg('error.accounts.bio-length', { max: BIO_MAX }))
    }
    if (website.length > WEBSITE_MAX) {
      throw new ValidationError(msg('error.accounts.website-length', { max: WEBSITE_MAX }))
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
    readonly locale: string
    readonly postsPerPage: string
    readonly threadsPerPage: string
    readonly invisible: boolean
  }): Promise<void> {
    const timezone = input.timezone.trim()
    if (!isTimezonePreference(timezone)) {
      throw new ValidationError(msg('error.accounts.timezone-board-recognises'))
    }

    const locale = input.locale.trim()
    if (!isLocalePreference(locale)) {
      throw new ValidationError(msg('error.accounts.language-board-recognises'))
    }

    await this.settings.saveOptions({
      userId: input.userId,
      timezone,
      locale,
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
      throw new ValidationError(msg('error.accounts.password-min', { min: input.minLength }))
    }
    if (next === input.currentPassword) {
      throw new ValidationError(msg('error.accounts.password-already-using'))
    }

    const hash = await hashPassword(next)
    const at = this.now()
    await this.accounts.updatePassword(account.id, hash, 'argon2id')
    await this.sessions.revokeAllForUser(account.id)
    await this.remember.revokeAllForUser(account.id, 'password_change', at)
    await this.tokens.revokeAllForUser(account.id, 'email_change')
  }

  async requestEmailChange(input: {
    readonly userId: number
    readonly currentPassword: string
    readonly newEmail: string
  }): Promise<{ token: string; email: string; previousEmail: string; expiresAt: Date }> {
    const account = await this.requireVerified(input.userId, input.currentPassword)

    const email = input.newEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError(msg('error.accounts.look-like-e-mail-address'))
    }

    const emailLower = foldIdentifier(email)
    if (emailLower === account.emailLower) {
      throw new ValidationError(msg('error.accounts.address-already-using'))
    }

    const taken = await this.accounts.findByEmailLower(emailLower)
    if (taken !== null) {
      throw new ValidationError(msg('error.accounts.address-already-use-board'))
    }

    const token = generateToken()
    const at = this.now()
    const expiresAt = new Date(at.getTime() + EMAIL_CHANGE_TTL_MINUTES * 60_000)

    await this.tokens.revokeAllForUser(account.id, 'email_change')
    await this.tokens.issue({
      tokenHash: await hashToken(token),
      userId: account.id,
      purpose: 'email_change',
      payload: JSON.stringify({ version: 1, email, previousEmailLower: account.emailLower }),
      expiresAt,
    })

    return { token, email, previousEmail: account.email, expiresAt }
  }

  async confirmEmailChange(
    token: string,
    actorUserId: number,
  ): Promise<{ userId: number; email: string; previousEmail: string } | null> {
    const tokenHash = await hashToken(token)
    const pending = await this.tokens.peek(tokenHash, 'email_change', this.now())
    if (pending === null || pending.userId !== actorUserId) return null

    const payload = parseEmailChangePayload(pending.payload)
    if (payload === null) return null

    const account = await this.accounts.findById(pending.userId)
    if (account === null || account.emailLower !== payload.previousEmailLower) return null

    const consumed = await this.tokens.consume(tokenHash, 'email_change', this.now())
    if (
      consumed === null ||
      consumed.userId !== pending.userId ||
      consumed.payload !== pending.payload
    ) {
      return null
    }

    const adopted = await this.settings.adoptEmail({
      userId: pending.userId,
      email: payload.email,
      emailLower: foldIdentifier(payload.email),
    })

    return adopted
      ? { userId: pending.userId, email: payload.email, previousEmail: account.email }
      : null
  }

  private async requireVerified(userId: number, currentPassword: string) {
    const account = await this.accounts.findById(userId)
    if (account === null) throw new ValidationError(msg('error.accounts.account-exist'))

    if (account.passwordHash === null) {
      throw new ValidationError(msg('error.accounts.account-password-set-so-changed'))
    }

    const ok = await verifyPassword(currentPassword, account.passwordHash)
    if (!ok) throw new ValidationError(msg('error.accounts.current-password'))

    void needsRehash

    return account
  }
}

function parseEmailChangePayload(
  payload: string | null,
): { email: string; previousEmailLower: string } | null {
  if (payload === null) return null

  try {
    const parsed: unknown = JSON.parse(payload)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('email' in parsed) ||
      typeof parsed.email !== 'string' ||
      !('previousEmailLower' in parsed) ||
      typeof parsed.previousEmailLower !== 'string'
    ) {
      return null
    }
    return { email: parsed.email, previousEmailLower: parsed.previousEmailLower }
  } catch {
    return null
  }
}

function parsePageSize(raw: string, label: string): number | null {
  const value = raw.trim()
  if (value === '') return null

  if (!/^[1-9]\d*$/.test(value)) {
    throw new ValidationError(msg('error.accounts.page-size-number', { label }))
  }
  const size = Number(value)
  if (!Number.isSafeInteger(size) || size < PAGE_SIZE_MIN || size > PAGE_SIZE_MAX) {
    throw new ValidationError(
      msg('error.accounts.page-size-range', { label, min: PAGE_SIZE_MIN, max: PAGE_SIZE_MAX }),
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
    throw new ValidationError(msg('error.accounts.look-like-web-address'))
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(msg('error.accounts.website-address-must-start-with'))
  }
  return url.toString()
}
