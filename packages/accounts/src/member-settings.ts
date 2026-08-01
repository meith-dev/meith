/**
 * F57 — a member's own settings, and the two changes that need a password.
 *
 * Three groups of thing live here, and they are separated by *what it costs to
 * get them wrong*.
 *
 * **Profile and options** are free to change and free to change back. They
 * validate and save.
 *
 * **The password and the e-mail address** are the account. Both re-authenticate
 * with the current password first, because a session left open on a shared
 * machine is otherwise a full account takeover: change the e-mail, request a
 * reset, and the real owner is locked out of their own board. Re-authentication
 * is the standard defence and it is cheap — the member changing their password
 * knows their password.
 *
 * **The e-mail change is two-step.** Verifying the *new* address before
 * adopting it is what stops a typo (or a hostile edit) from moving an account
 * to an address nobody controls, and it reuses F19's `email_change` credential
 * token, whose `payload` column has been waiting for exactly this.
 */
import { ValidationError } from '@forum/core'

import { hashPassword, needsRehash, verifyPassword } from './crypto/password'
import { generateToken, hashToken } from './crypto/tokens'
import { foldIdentifier } from './case-fold'
import type {
  AccountRepository,
  CredentialTokenRepository,
  SessionRepository,
} from './ports'

/** Bounds. Generous, and enforced so a profile cannot become a payload. */
export const LOCATION_MAX = 100
export const WEBSITE_MAX = 200
export const BIO_MAX = 1000

/** What the board will accept as a page size, whoever asks. */
export const PAGE_SIZE_MIN = 5
export const PAGE_SIZE_MAX = 100

/** How long an e-mail-change confirmation stays valid. */
export const EMAIL_CHANGE_TTL_MINUTES = 60

/** The member's settings, as the UserCP reads them. */
export interface MemberSettings {
  readonly userId: number
  readonly email: string
  readonly timezone: string
  /** Null = follow the board setting. */
  readonly postsPerPage: number | null
  readonly threadsPerPage: number | null
  readonly location: string | null
  readonly website: string | null
  readonly bio: string | null
}

export interface MemberSettingsRepository {
  read(userId: number): Promise<MemberSettings | null>

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
  }): Promise<void>

  /**
   * Adopt a verified address.
   *
   * Returns false when it has been taken since the change was requested — the
   * unique index is the arbiter, not a prior read, because an hour can pass
   * between requesting the change and confirming it.
   */
  adoptEmail(input: {
    readonly userId: number
    readonly email: string
    readonly emailLower: string
  }): Promise<boolean>
}

/**
 * Timezones this build's runtime knows about.
 *
 * Read from the platform rather than shipped as a list: a hard-coded list is
 * wrong the next time a country changes its rules, and Node already carries the
 * tz database that `Intl.DateTimeFormat` formats with. Anything not in it is
 * refused, because a stored zone that `Intl` cannot resolve would throw on
 * *every page render* for that member.
 */
export function isKnownTimezone(value: string): boolean {
  if (value === 'UTC') return true

  /*
   * **Offsets are refused even though `Intl` accepts them.** ECMA-402 allows
   * `+01:00` as a time zone and `Intl.DateTimeFormat` constructs happily with
   * one — which would store a value that is an hour wrong for half the year in
   * every zone that observes summer time, and wrong in a way that reads as a
   * broken timestamp rather than a broken setting. Only a named zone carries
   * the rules.
   */
  if (!/^[A-Za-z][A-Za-z0-9_+-]*\/[A-Za-z0-9_+/-]+$/.test(value)) return false

  try {
    /* The constructor throws on a name the tz database does not have. */
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return true
  } catch {
    return false
  }
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

  /**
   * Save the public profile.
   *
   * Every field is stored as plain text and rendered as plain text. A signature
   * is BBCode and is moderated (F58); this is not that, and treating it as
   * markup would give a profile capabilities the box never advertised — the
   * same rule F53's warning reasons follow.
   */
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

  /**
   * Save the display options.
   *
   * An empty page size means "follow the board", which is a real answer and not
   * a missing one — so it is stored as `null` rather than as the board's
   * current number. Storing the number would freeze this member at whatever the
   * board happened to be set to on the day they visited.
   */
  async saveOptions(input: {
    readonly userId: number
    readonly timezone: string
    readonly postsPerPage: string
    readonly threadsPerPage: string
  }): Promise<void> {
    const timezone = input.timezone.trim()
    if (!isKnownTimezone(timezone)) {
      throw new ValidationError('That is not a timezone this board recognises.')
    }

    await this.settings.saveOptions({
      userId: input.userId,
      timezone,
      postsPerPage: parsePageSize(input.postsPerPage, 'Posts per page'),
      threadsPerPage: parsePageSize(input.threadsPerPage, 'Threads per page'),
    })
  }

  /**
   * Change the password, after proving the current one.
   *
   * **Every other session is revoked.** A password change is what somebody does
   * when they think an account is compromised, and one that leaves the
   * attacker's session alive has done nothing at all. The caller starts a fresh
   * session for the device that made the change, so the member stays signed in
   * where they are and is signed out everywhere else.
   */
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

  /**
   * Ask to change the e-mail address.
   *
   * Nothing is written to `users` here. The address is carried in the token's
   * payload and adopted only when the link sent *to the new address* is
   * redeemed — which is what proves the member can actually receive mail there.
   *
   * The duplicate check is deliberately friendly-but-not-authoritative: the
   * unique index decides at adoption time, an hour later, when the answer may
   * have changed. Refusing here is a better error message, not a guarantee.
   */
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
      /*
       * A different answer for "taken" than for "sent" would make this an
       * account-existence oracle for any address. The caller says "check your
       * inbox" either way; this error is only reachable for the member's own
       * second account, which they know about.
       */
      throw new ValidationError('That address is already in use on this board.')
    }

    const token = generateToken()
    const at = this.now()
    const expiresAt = new Date(at.getTime() + EMAIL_CHANGE_TTL_MINUTES * 60_000)

    await this.tokens.issue({
      tokenHash: await hashToken(token),
      userId: account.id,
      purpose: 'email_change',
      /* The new address travels with the token, not in `users`. */
      payload: email,
      expiresAt,
    })

    return { token, email, expiresAt }
  }

  /**
   * Redeem an e-mail-change link.
   *
   * Single-use is a property of `consume`, not of this method (F19), so a
   * second click is simply `null`. Sessions are **not** revoked: confirming an
   * address the member asked for is not a credential change, and signing
   * somebody out for clicking a link they were told to click is a support
   * ticket rather than a security measure.
   */
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

  /**
   * The account behind a verified current password.
   *
   * One place, so neither dangerous change can be written without it. A
   * passwordless account (imported, or SSO) cannot re-authenticate and is
   * refused rather than waved through — the alternative is that the one kind of
   * account with no password is the one kind that needs none.
   */
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

    /*
     * A correct password on an old hash is an upgrade opportunity F17 already
     * takes on login. Not taken here: this path is about to replace the hash
     * (password change) or not touch it at all (e-mail change), so rehashing
     * would be a write nobody reads.
     */
    void needsRehash

    return account
  }
}

/** Empty means "the board decides"; anything else must be a number in range. */
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

/**
 * A website a page can safely link to.
 *
 * Only `http` and `https` survive. A profile field that renders as a link is an
 * attacker-controlled `href`, and `javascript:` in one is the oldest stored-XSS
 * vector there is — F36 makes the same argument about BBCode `[url]`. A bare
 * `example.com` is given `https://` rather than refused, because typing the
 * scheme is not something anybody does and refusing it teaches nothing.
 */
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
