import { beforeEach, describe, expect, it } from 'vitest'

import { hashPassword } from './crypto/password'
import {
  AUTOMATIC_LOCALE,
  AUTOMATIC_TIMEZONE,
  isKnownTimezone,
  isTimezonePreference,
  type MemberGroupChoice,
  type MemberSettings,
  type MemberSettingsRepository,
  MemberSettingsService,
} from './member-settings'
import type {
  AccountRecord,
  AccountRepository,
  CredentialPurpose,
  CredentialTokenRepository,
  RememberTokenRepository,
  SessionRepository,
} from './ports'

const NOW = new Date('2026-07-31T12:00:00Z')
const PASSWORD = 'correct horse battery staple'

class MemorySettings implements MemberSettingsRepository {
  row: MemberSettings = {
    userId: 7,
    email: 'ivan@example.test',
    timezone: 'UTC',
    locale: 'auto',
    postsPerPage: null,
    threadsPerPage: null,
    invisible: false,
    location: null,
    website: null,
    bio: null,
    displayGroupId: null,
    massMailOptInAt: null,
    boardDigestCadence: 'weekly',
    autoWatchOwnThreads: 'none',
    autoWatchRepliedThreads: 'none',
  }
  emailTaken = false
  held: MemberGroupChoice[] = [
    { groupId: 2, title: 'Registered', isPrimary: true, isStaff: false },
    { groupId: 5, title: 'Supporters', isPrimary: false, isStaff: false },
  ]
  readonly adopted: Array<{ userId: number; email: string }> = []

  async read(): Promise<MemberSettings | null> {
    return this.row
  }
  async groupsHeldBy(): Promise<readonly MemberGroupChoice[]> {
    return this.held
  }
  async saveDisplayGroup(input: { userId: number; displayGroupId: number | null }) {
    this.row = { ...this.row, displayGroupId: input.displayGroupId }
  }
  async saveProfile(input: {
    userId: number
    location: string | null
    website: string | null
    bio: string | null
  }) {
    this.row = { ...this.row, ...input }
  }
  async saveOptions(input: {
    userId: number
    timezone: string
    postsPerPage: number | null
    threadsPerPage: number | null
    autoWatchOwnThreads: MemberSettings['autoWatchOwnThreads']
    autoWatchRepliedThreads: MemberSettings['autoWatchRepliedThreads']
  }) {
    this.row = { ...this.row, ...input }
  }
  async saveMassMailOptIn(input: { userId: number; optIn: boolean }) {
    this.row = {
      ...this.row,
      massMailOptInAt: input.optIn ? (this.row.massMailOptInAt ?? NOW) : null,
    }
  }
  async adoptEmail(input: { userId: number; email: string; emailLower: string }) {
    if (this.emailTaken) return false
    this.adopted.push({ userId: input.userId, email: input.email })
    this.row = { ...this.row, email: input.email }
    return true
  }
  async saveBoardDigestCadence(input: { userId: number; cadence: string }) {
    this.row = { ...this.row, boardDigestCadence: input.cadence }
  }
}

class MemoryAccounts implements AccountRepository {
  account: AccountRecord | null = null
  async touchLastActive(): Promise<boolean> {
    return false
  }
  otherEmailLower: string | null = null
  readonly passwords: Array<{ userId: number; hash: string }> = []

  async findById(): Promise<AccountRecord | null> {
    return this.account
  }
  async findByUsernameLower(): Promise<AccountRecord | null> {
    return null
  }
  async findByEmailLower(emailLower: string): Promise<AccountRecord | null> {
    return emailLower === this.otherEmailLower
      ? { ...(this.account as AccountRecord), id: 99 }
      : null
  }
  async create(): Promise<AccountRecord> {
    throw new Error('not used')
  }
  async updatePassword(userId: number, passwordHash: string) {
    this.passwords.push({ userId, hash: passwordHash })
  }
  async setState() {}
  async markEmailVerified(): Promise<null> {
    return null
  }
  async recordLastIpPrefix() {}
}

class MemorySessions {
  readonly revoked: number[] = []
  async revokeAllForUser(userId: number) {
    this.revoked.push(userId)
  }
}

class MemoryRemember {
  readonly revoked: Array<{ userId: number; reason: string; at: Date }> = []

  async revokeAllForUser(userId: number, reason: string, at: Date) {
    this.revoked.push({ userId, reason, at })
  }
}

class MemoryTokens {
  readonly issued: Array<{ userId: number; purpose: string; payload: string | null }> = []
  readonly revoked: Array<{ userId: number; purpose: CredentialPurpose }> = []
  redeemable: { userId: number; payload: string | null } | null = null

  async issue(input: {
    tokenHash: string
    userId: number
    purpose: CredentialPurpose
    payload?: string | null
    expiresAt: Date
  }) {
    this.issued.push({
      userId: input.userId,
      purpose: input.purpose,
      payload: input.payload ?? null,
    })
  }
  async peek() {
    return this.redeemable
  }
  async consume() {
    const value = this.redeemable
    this.redeemable = null
    return value
  }
  async revokeAllForUser(userId: number, purpose: CredentialPurpose) {
    this.revoked.push({ userId, purpose })
    if (this.redeemable?.userId === userId) this.redeemable = null
  }
}

let settings: MemorySettings
let accounts: MemoryAccounts
let sessions: MemorySessions
let remember: MemoryRemember
let tokens: MemoryTokens
let service: MemberSettingsService

beforeEach(async () => {
  settings = new MemorySettings()
  accounts = new MemoryAccounts()
  sessions = new MemorySessions()
  remember = new MemoryRemember()
  tokens = new MemoryTokens()

  accounts.account = {
    id: 7,
    username: 'ivan',
    usernameLower: 'ivan',
    email: 'ivan@example.test',
    emailLower: 'ivan@example.test',
    passwordHash: await hashPassword(PASSWORD),
    passwordAlgo: 'argon2id',
    state: 'active',
    emailVerifiedAt: null,
    primaryGroupId: 2,
  }

  service = new MemberSettingsService({
    settings,
    accounts,
    sessions: sessions as unknown as SessionRepository,
    remember: remember as unknown as RememberTokenRepository,
    tokens: tokens as unknown as CredentialTokenRepository,
    now: () => NOW,
  })
}, 20_000)

describe('the profile', () => {
  it('trims, saves, and turns an empty field into an absent one', async () => {
    await service.saveProfile({
      userId: 7,
      location: '  Cambridge  ',
      website: '',
      bio: 'Hello.',
    })

    expect(settings.row.location).toBe('Cambridge')
    expect(settings.row.website).toBeNull()
    expect(settings.row.bio).toBe('Hello.')
  })

  it('adds a scheme to a bare host rather than refusing it', async () => {
    await service.saveProfile({ userId: 7, location: '', website: 'example.test', bio: '' })
    expect(settings.row.website).toBe('https://example.test/')
  })

  it('refuses a javascript: URL', async () => {
    await expect(
      service.saveProfile({ userId: 7, location: '', website: 'javascript:alert(1)', bio: '' }),
    ).rejects.toThrow('http://')
  })

  it('refuses a field longer than its limit', async () => {
    await expect(
      service.saveProfile({ userId: 7, location: 'x'.repeat(101), website: '', bio: '' }),
    ).rejects.toThrow('at most 100')
  })
})

describe('the display group', () => {
  it('saves a group the member is in', async () => {
    await service.saveDisplayGroup({ userId: 7, displayGroupId: '5' })
    expect(settings.row.displayGroupId).toBe(5)
  })

  it('stores nothing for the primary group, so the choice follows it', async () => {
    settings.row = { ...settings.row, displayGroupId: 5 }
    await service.saveDisplayGroup({ userId: 7, displayGroupId: '2' })
    expect(settings.row.displayGroupId).toBeNull()
  })

  it('reads an empty choice as the primary group too', async () => {
    settings.row = { ...settings.row, displayGroupId: 5 }
    await service.saveDisplayGroup({ userId: 7, displayGroupId: '' })
    expect(settings.row.displayGroupId).toBeNull()
  })

  it('refuses a group the member is not in', async () => {
    await expect(service.saveDisplayGroup({ userId: 7, displayGroupId: '9' })).rejects.toThrow(
      'a group you are in',
    )
  })

  it('refuses anything that is not a group id', async () => {
    await expect(service.saveDisplayGroup({ userId: 7, displayGroupId: 'gold' })).rejects.toThrow(
      'not a group',
    )
  })

  it('lists the groups a member holds', async () => {
    expect(await service.groupsHeldBy(7)).toHaveLength(2)
  })
})

describe('the options', () => {
  it('saves a real timezone', async () => {
    await service.saveOptions({
      userId: 7,
      timezone: 'Europe/London',
      locale: 'auto',
      postsPerPage: '',
      threadsPerPage: '',
      invisible: false,
      autoWatchOwnThreads: 'none',
      autoWatchRepliedThreads: 'none',
    })
    expect(settings.row.timezone).toBe('Europe/London')
  })

  it('saves the automatic preference, which names no zone at all', async () => {
    await service.saveOptions({
      userId: 7,
      timezone: AUTOMATIC_TIMEZONE,
      locale: 'auto',
      postsPerPage: '',
      threadsPerPage: '',
      invisible: false,
      autoWatchOwnThreads: 'none',
      autoWatchRepliedThreads: 'none',
    })
    expect(settings.row.timezone).toBe(AUTOMATIC_TIMEZONE)
  })

  it('refuses a timezone the runtime does not know', async () => {
    await expect(
      service.saveOptions({
        userId: 7,
        timezone: 'Middle/Earth',
        locale: 'auto',
        postsPerPage: '',
        threadsPerPage: '',
        invisible: false,
        autoWatchOwnThreads: 'none',
        autoWatchRepliedThreads: 'none',
      }),
    ).rejects.toThrow('not a timezone')
  })

  it('refuses an offset, which cannot express summer time', async () => {
    await expect(
      service.saveOptions({
        userId: 7,
        timezone: '+01:00',
        locale: 'auto',
        postsPerPage: '',
        threadsPerPage: '',
        invisible: false,
        autoWatchOwnThreads: 'none',
        autoWatchRepliedThreads: 'none',
      }),
    ).rejects.toThrow('not a timezone')
  })

  it('saves a language tag, spelled the one way the catalog is keyed', async () => {
    await service.saveOptions({
      userId: 7,
      timezone: 'UTC',
      locale: 'pt-BR',
      postsPerPage: '',
      threadsPerPage: '',
      invisible: false,
      autoWatchOwnThreads: 'none',
      autoWatchRepliedThreads: 'none',
    })
    expect(settings.row.locale).toBe('pt-BR')
  })

  it('saves the automatic preference, which names no language at all', async () => {
    await service.saveOptions({
      userId: 7,
      timezone: 'UTC',
      locale: AUTOMATIC_LOCALE,
      postsPerPage: '',
      threadsPerPage: '',
      invisible: false,
      autoWatchOwnThreads: 'none',
      autoWatchRepliedThreads: 'none',
    })
    expect(settings.row.locale).toBe(AUTOMATIC_LOCALE)
  })

  it('refuses anything that is not a language tag', async () => {
    await expect(
      service.saveOptions({
        userId: 7,
        timezone: 'UTC',
        locale: 'english',
        postsPerPage: '',
        threadsPerPage: '',
        invisible: false,
        autoWatchOwnThreads: 'none',
        autoWatchRepliedThreads: 'none',
      }),
    ).rejects.toThrow('not a language')
  })

  it('stores an empty page size as "follow the board"', async () => {
    await service.saveOptions({
      userId: 7,
      timezone: 'UTC',
      locale: 'auto',
      postsPerPage: '',
      threadsPerPage: '  ',
      invisible: false,
      autoWatchOwnThreads: 'none',
      autoWatchRepliedThreads: 'none',
    })

    expect(settings.row.postsPerPage).toBeNull()
    expect(settings.row.threadsPerPage).toBeNull()
  })

  it('refuses a page size outside the bounds', async () => {
    for (const value of ['0', '1', '1000', 'lots']) {
      await expect(
        service.saveOptions({
          userId: 7,
          timezone: 'UTC',
          locale: 'auto',
          postsPerPage: value,
          threadsPerPage: '',
          invisible: false,
          autoWatchOwnThreads: 'none',
          autoWatchRepliedThreads: 'none',
        }),
      ).rejects.toThrow(/Posts per page/)
    }
  })
})

describe('the auto-watch preferences', () => {
  it('saves a cadence for each of the two preferences independently', async () => {
    await service.saveOptions({
      userId: 7,
      timezone: 'UTC',
      locale: 'auto',
      postsPerPage: '',
      threadsPerPage: '',
      invisible: false,
      autoWatchOwnThreads: 'instant',
      autoWatchRepliedThreads: 'daily',
    })

    expect(settings.row.autoWatchOwnThreads).toBe('instant')
    expect(settings.row.autoWatchRepliedThreads).toBe('daily')
  })

  it('accepts "none" as the off position', async () => {
    await service.saveOptions({
      userId: 7,
      timezone: 'UTC',
      locale: 'auto',
      postsPerPage: '',
      threadsPerPage: '',
      invisible: false,
      autoWatchOwnThreads: 'none',
      autoWatchRepliedThreads: 'none',
    })

    expect(settings.row.autoWatchOwnThreads).toBe('none')
    expect(settings.row.autoWatchRepliedThreads).toBe('none')
  })

  it('refuses a cadence that is not one of the four subscription modes', async () => {
    await expect(
      service.saveOptions({
        userId: 7,
        timezone: 'UTC',
        locale: 'auto',
        postsPerPage: '',
        threadsPerPage: '',
        invisible: false,
        autoWatchOwnThreads: 'sometimes',
        autoWatchRepliedThreads: 'none',
      }),
    ).rejects.toThrow(/follow cadence/)
  })
})

describe('the board digest cadence', () => {
  it('accepts weekly or monthly', async () => {
    await service.saveBoardDigestCadence({ userId: 7, cadence: 'monthly' })
    expect(settings.row.boardDigestCadence).toBe('monthly')
  })

  it('refuses anything else', async () => {
    await expect(service.saveBoardDigestCadence({ userId: 7, cadence: 'daily' })).rejects.toThrow(
      /weekly or monthly/,
    )
    expect(settings.row.boardDigestCadence).toBe('weekly')
  })
})

describe('changing the password', () => {
  it('requires the current one', async () => {
    await expect(
      service.changePassword({
        userId: 7,
        currentPassword: 'not it',
        newPassword: 'a new long password',
        minLength: 8,
      }),
    ).rejects.toThrow('not your current password')

    expect(accounts.passwords).toEqual([])
  }, 20_000)

  it('replaces the hash and signs every session out', async () => {
    await service.changePassword({
      userId: 7,
      currentPassword: PASSWORD,
      newPassword: 'a new long password',
      minLength: 8,
    })

    expect(accounts.passwords).toHaveLength(1)
    expect(sessions.revoked).toEqual([7])
    expect(remember.revoked).toEqual([{ userId: 7, reason: 'password_change', at: NOW }])
    expect(tokens.revoked).toContainEqual({ userId: 7, purpose: 'email_change' })
  }, 20_000)

  it('refuses a password shorter than the board allows', async () => {
    await expect(
      service.changePassword({
        userId: 7,
        currentPassword: PASSWORD,
        newPassword: 'short',
        minLength: 8,
      }),
    ).rejects.toThrow('at least 8')
  }, 20_000)

  it('refuses the password already in use', async () => {
    await expect(
      service.changePassword({
        userId: 7,
        currentPassword: PASSWORD,
        newPassword: PASSWORD,
        minLength: 8,
      }),
    ).rejects.toThrow('already using')
  }, 20_000)

  it('refuses an account with no password to prove', async () => {
    accounts.account = { ...(accounts.account as AccountRecord), passwordHash: null }

    await expect(
      service.changePassword({
        userId: 7,
        currentPassword: '',
        newPassword: 'a new long password',
        minLength: 8,
      }),
    ).rejects.toThrow('no password set')
  })
})

function emailChangePayload(
  email = 'new@example.test',
  previousEmailLower = 'ivan@example.test',
): string {
  return JSON.stringify({ version: 1, email, previousEmailLower })
}

describe('changing the e-mail address', () => {
  it('writes nothing until the new address is confirmed', async () => {
    const pending = await service.requestEmailChange({
      userId: 7,
      currentPassword: PASSWORD,
      newEmail: 'new@example.test',
    })

    expect(pending.email).toBe('new@example.test')
    expect(tokens.issued).toEqual([
      { userId: 7, purpose: 'email_change', payload: emailChangePayload() },
    ])
    expect(tokens.revoked).toEqual([{ userId: 7, purpose: 'email_change' }])
    expect(settings.row.email).toBe('ivan@example.test')
  }, 20_000)

  it('names the address being left, so the old one can be told', async () => {
    const pending = await service.requestEmailChange({
      userId: 7,
      currentPassword: PASSWORD,
      newEmail: 'new@example.test',
    })

    expect(pending.previousEmail).toBe('ivan@example.test')
  }, 20_000)

  it('requires the current password', async () => {
    await expect(
      service.requestEmailChange({
        userId: 7,
        currentPassword: 'not it',
        newEmail: 'new@example.test',
      }),
    ).rejects.toThrow('not your current password')

    expect(tokens.issued).toEqual([])
  }, 20_000)

  it('refuses an address that is not one', async () => {
    await expect(
      service.requestEmailChange({
        userId: 7,
        currentPassword: PASSWORD,
        newEmail: 'not-an-address',
      }),
    ).rejects.toThrow('does not look like')
  }, 20_000)

  it('refuses the address already on the account', async () => {
    await expect(
      service.requestEmailChange({
        userId: 7,
        currentPassword: PASSWORD,
        newEmail: 'IVAN@example.test',
      }),
    ).rejects.toThrow('already using')
  }, 20_000)

  it('refuses an address another account holds', async () => {
    accounts.otherEmailLower = 'taken@example.test'

    await expect(
      service.requestEmailChange({
        userId: 7,
        currentPassword: PASSWORD,
        newEmail: 'taken@example.test',
      }),
    ).rejects.toThrow('already in use')
  }, 20_000)

  it('adopts the address when the link is followed', async () => {
    tokens.redeemable = { userId: 7, payload: emailChangePayload() }

    expect(await service.confirmEmailChange('a-token', 7)).toEqual({
      userId: 7,
      email: 'new@example.test',
      previousEmail: 'ivan@example.test',
    })
    expect(settings.adopted).toEqual([{ userId: 7, email: 'new@example.test' }])
  })

  it('names the address left behind, so it can be told the change went through', async () => {
    tokens.redeemable = { userId: 7, payload: emailChangePayload() }

    const outcome = await service.confirmEmailChange('a-token', 7)

    expect(outcome?.previousEmail).toBe('ivan@example.test')
  })

  it('does nothing on a second click', async () => {
    tokens.redeemable = { userId: 7, payload: emailChangePayload() }

    await service.confirmEmailChange('a-token', 7)
    expect(await service.confirmEmailChange('a-token', 7)).toBeNull()
    expect(settings.adopted).toHaveLength(1)
  })

  it('invalidates an earlier link when a newer change is requested', async () => {
    tokens.redeemable = { userId: 7, payload: emailChangePayload('old@example.test') }

    await service.requestEmailChange({
      userId: 7,
      currentPassword: PASSWORD,
      newEmail: 'new@example.test',
    })

    expect(await service.confirmEmailChange('old-token', 7)).toBeNull()
  }, 20_000)

  it('refuses confirmation from a different signed-in account without spending the link', async () => {
    tokens.redeemable = { userId: 7, payload: emailChangePayload() }

    expect(await service.confirmEmailChange('a-token', 99)).toBeNull()
    expect(await service.confirmEmailChange('a-token', 7)).not.toBeNull()
  })

  it('refuses a link after the account address has changed', async () => {
    tokens.redeemable = { userId: 7, payload: emailChangePayload() }
    accounts.account = {
      ...(accounts.account as AccountRecord),
      email: 'other@example.test',
      emailLower: 'other@example.test',
    }

    expect(await service.confirmEmailChange('a-token', 7)).toBeNull()
    expect(settings.adopted).toEqual([])
  })

  it.each(['new@example.test', '{"version":2}', '{not-json'])(
    'refuses a legacy or malformed payload: %s',
    async (payload) => {
      tokens.redeemable = { userId: 7, payload }

      expect(await service.confirmEmailChange('a-token', 7)).toBeNull()
      expect(settings.adopted).toEqual([])
    },
  )

  it('reports failure when the address was taken in the meantime', async () => {
    tokens.redeemable = { userId: 7, payload: emailChangePayload() }
    settings.emailTaken = true

    expect(await service.confirmEmailChange('a-token', 7)).toBeNull()
  })
})

describe('isKnownTimezone', () => {
  it('accepts UTC and real IANA names', () => {
    expect(isKnownTimezone('UTC')).toBe(true)
    expect(isKnownTimezone('Europe/London')).toBe(true)
    expect(isKnownTimezone('America/New_York')).toBe(true)
  })

  it('rejects offsets, nonsense and empty strings', () => {
    expect(isKnownTimezone('+01:00')).toBe(false)
    expect(isKnownTimezone('Middle/Earth')).toBe(false)
    expect(isKnownTimezone('')).toBe(false)
  })

  it('is not the place the automatic preference is accepted', () => {
    expect(isKnownTimezone(AUTOMATIC_TIMEZONE)).toBe(false)
  })
})

describe('isTimezonePreference', () => {
  it('accepts the automatic preference as well as a stored zone', () => {
    expect(isTimezonePreference(AUTOMATIC_TIMEZONE)).toBe(true)
    expect(isTimezonePreference('Europe/London')).toBe(true)
  })

  it('still refuses an offset', () => {
    expect(isTimezonePreference('+01:00')).toBe(false)
  })
})
