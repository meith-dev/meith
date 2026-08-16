import type {
  AccountRecord,
  AccountRepository,
  AccountState,
  AccountStore,
  CredentialPurpose,
  CredentialTokenRepository,
  LinkIdentityInput,
  LoginAttemptRepository,
  NewAccount,
  NewPasskey,
  PasskeyRecord,
  PasskeyRepository,
  RememberRotation,
  RememberTokenRepository,
  SessionLocation,
  SessionRecord,
  SessionRepository,
  UserIdentityRecord,
  UserIdentityRepository,
} from './ports'

class MemoryAccounts implements AccountRepository {
  private readonly byId = new Map<number, AccountRecord>()
  private readonly ipPrefixes = new Map<
    number,
    { registration: string | null; lastVisit: string | null }
  >()
  private seq = 0

  async findById(id: number): Promise<AccountRecord | null> {
    return this.byId.get(id) ?? null
  }

  async findByUsernameLower(usernameLower: string): Promise<AccountRecord | null> {
    for (const a of this.byId.values()) {
      if (a.usernameLower === usernameLower) return a
    }
    return null
  }

  async findByEmailLower(emailLower: string): Promise<AccountRecord | null> {
    for (const a of this.byId.values()) {
      if (a.emailLower === emailLower) return a
    }
    return null
  }

  async create(input: NewAccount): Promise<AccountRecord> {
    const record: AccountRecord = {
      id: ++this.seq,
      username: input.username,
      usernameLower: input.usernameLower,
      email: input.email,
      emailLower: input.emailLower,
      passwordHash: input.passwordHash,
      passwordAlgo: input.passwordAlgo,
      state: input.state,
      emailVerifiedAt: null,
      // eslint-disable-next-line no-restricted-properties -- group-id transport, not a decision
      primaryGroupId: input.primaryGroupId,
    }
    this.byId.set(record.id, record)
    this.ipPrefixes.set(record.id, {
      registration: input.registrationIpPrefix ?? null,
      lastVisit: null,
    })
    return record
  }

  async recordLastIpPrefix(userId: number, prefix: string): Promise<void> {
    const current = this.ipPrefixes.get(userId)
    if (current === undefined) return
    this.ipPrefixes.set(userId, { ...current, lastVisit: prefix })
  }

  async updatePassword(userId: number, passwordHash: string, passwordAlgo: string): Promise<void> {
    const cur = this.byId.get(userId)
    if (cur) this.byId.set(userId, { ...cur, passwordHash, passwordAlgo })
  }

  async setState(userId: number, state: AccountState): Promise<void> {
    const cur = this.byId.get(userId)
    if (cur) this.byId.set(userId, { ...cur, state })
  }

  async markEmailVerified(
    userId: number,
    at: Date,
    activate: boolean,
  ): Promise<AccountState | null> {
    const cur = this.byId.get(userId)
    if (cur === undefined) return null

    this.byId.set(userId, {
      ...cur,
      emailVerifiedAt: cur.emailVerifiedAt ?? at,
      state: activate && cur.state === 'awaiting_activation' ? 'active' : cur.state,
    })

    return cur.state
  }

  private readonly lastActive = new Map<number, Date>()

  async touchLastActive(userId: number, now: Date, windowSeconds: number): Promise<boolean> {
    if (!this.byId.has(userId)) return false

    const previous = this.lastActive.get(userId)
    if (previous !== undefined && now.getTime() - previous.getTime() < windowSeconds * 1000) {
      return false
    }

    this.lastActive.set(userId, now)
    return true
  }
}

class MemorySessions implements SessionRepository {
  private readonly byId = new Map<number, SessionRecord>()
  private readonly byHash = new Map<string, number>()
  private readonly lastLocationWrite = new Map<number, number>()
  private seq = 0

  async create(input: {
    tokenHash: string
    userId: number
    expiresAt: Date
  }): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: ++this.seq,
      userId: input.userId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      supersededBySessionId: null,
      lastSeenAt: new Date(),
    }
    this.byId.set(record.id, record)
    this.byHash.set(input.tokenHash, record.id)
    return record
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const id = this.byHash.get(tokenHash)
    return id === undefined ? null : (this.byId.get(id) ?? null)
  }

  async revoke(sessionId: number): Promise<void> {
    const cur = this.byId.get(sessionId)
    if (cur && cur.revokedAt === null) {
      this.byId.set(sessionId, { ...cur, revokedAt: new Date() })
    }
  }

  async revokeAllForUser(userId: number): Promise<void> {
    for (const [id, s] of this.byId) {
      if (s.userId === userId && s.revokedAt === null) {
        this.byId.set(id, { ...s, revokedAt: new Date() })
      }
    }
  }

  async supersede(oldSessionId: number, newSessionId: number, now: Date): Promise<void> {
    const cur = this.byId.get(oldSessionId)
    if (cur) {
      this.byId.set(oldSessionId, {
        ...cur,
        supersededBySessionId: newSessionId,
        revokedAt: cur.revokedAt ?? now,
      })
    }
  }

  async touchLocation(
    sessionId: number,
    _location: SessionLocation,
    now: Date,
    windowSeconds: number,
  ): Promise<boolean> {
    const cur = this.byId.get(sessionId)
    if (!cur) return false
    const last = this.lastLocationWrite.get(sessionId)
    if (last !== undefined && (now.getTime() - last) / 1000 < windowSeconds) {
      return false
    }
    this.lastLocationWrite.set(sessionId, now.getTime())
    this.byId.set(sessionId, { ...cur, lastSeenAt: now })
    return true
  }
}

interface StoredRemember {
  familyId: string
  userId: number
  expiresAt: Date
  usedAt: Date | null
  revokedAt: Date | null
}

class MemoryRememberTokens implements RememberTokenRepository {
  private readonly byHash = new Map<string, StoredRemember>()

  async issue(input: {
    tokenHash: string
    familyId: string
    userId: number
    expiresAt: Date
  }): Promise<void> {
    this.byHash.set(input.tokenHash, {
      familyId: input.familyId,
      userId: input.userId,
      expiresAt: input.expiresAt,
      usedAt: null,
      revokedAt: null,
    })
  }

  async rotate(input: {
    presentedHash: string
    nextHash: string
    now: Date
    nextExpiresAt: Date
  }): Promise<RememberRotation> {
    const t = this.byHash.get(input.presentedHash)
    if (!t) return { status: 'invalid' }
    if (t.expiresAt.getTime() <= input.now.getTime()) return { status: 'invalid' }
    if (t.usedAt !== null || t.revokedAt !== null) {
      return { status: 'reuse', userId: t.userId, familyId: t.familyId }
    }
    this.byHash.set(input.presentedHash, { ...t, usedAt: input.now })
    this.byHash.set(input.nextHash, {
      familyId: t.familyId,
      userId: t.userId,
      expiresAt: input.nextExpiresAt,
      usedAt: null,
      revokedAt: null,
    })
    return { status: 'rotated', userId: t.userId, familyId: t.familyId }
  }

  async revokeFamily(familyId: string, _reason: string, now: Date): Promise<void> {
    for (const [hash, t] of this.byHash) {
      if (t.familyId === familyId && t.revokedAt === null) {
        this.byHash.set(hash, { ...t, revokedAt: now })
      }
    }
  }

  async findByTokenHash(tokenHash: string): Promise<{
    familyId: string
    userId: number
    usedAt: Date | null
    revokedAt: Date | null
  } | null> {
    const t = this.byHash.get(tokenHash)
    if (!t) return null
    return { familyId: t.familyId, userId: t.userId, usedAt: t.usedAt, revokedAt: t.revokedAt }
  }
}

interface StoredToken {
  userId: number
  purpose: CredentialPurpose
  payload: string | null
  expiresAt: Date
  consumedAt: Date | null
}

class MemoryCredentialTokens implements CredentialTokenRepository {
  private readonly byHash = new Map<string, StoredToken>()

  async issue(input: {
    tokenHash: string
    userId: number
    purpose: CredentialPurpose
    payload?: string | null
    expiresAt: Date
  }): Promise<void> {
    this.byHash.set(input.tokenHash, {
      userId: input.userId,
      purpose: input.purpose,
      payload: input.payload ?? null,
      expiresAt: input.expiresAt,
      consumedAt: null,
    })
  }

  async consume(
    tokenHash: string,
    purpose: CredentialPurpose,
    now: Date,
  ): Promise<{ userId: number; payload: string | null } | null> {
    const t = this.byHash.get(tokenHash)
    if (!t) return null
    if (t.purpose !== purpose) return null
    if (t.consumedAt !== null) return null
    if (t.expiresAt.getTime() <= now.getTime()) return null

    this.byHash.set(tokenHash, { ...t, consumedAt: now })
    return { userId: t.userId, payload: t.payload }
  }

  async revokeAllForUser(userId: number, purpose: CredentialPurpose): Promise<void> {
    const now = new Date()
    for (const [hash, t] of this.byHash) {
      if (t.userId === userId && t.purpose === purpose && t.consumedAt === null) {
        this.byHash.set(hash, { ...t, consumedAt: now })
      }
    }
  }
}

interface Attempt {
  succeeded: boolean
  at: Date
}

class MemoryLoginAttempts implements LoginAttemptRepository {
  private readonly buckets = new Map<string, Attempt[]>()

  async record(bucket: string, succeeded: boolean, at: Date): Promise<void> {
    const list = this.buckets.get(bucket) ?? []
    list.push({ succeeded, at })
    this.buckets.set(bucket, list)
  }

  async countFailuresSince(bucket: string, since: Date): Promise<number> {
    const list = this.buckets.get(bucket) ?? []
    return list.filter((a) => !a.succeeded && a.at.getTime() >= since.getTime()).length
  }

  async clear(bucket: string): Promise<void> {
    this.buckets.delete(bucket)
  }
}

class MemoryUserIdentities implements UserIdentityRepository {
  private readonly byId = new Map<number, UserIdentityRecord>()
  private seq = 0

  async findBySubject(provider: string, subject: string): Promise<UserIdentityRecord | null> {
    for (const record of this.byId.values()) {
      if (record.provider === provider && record.subject === subject) return record
    }
    return null
  }

  async listForUser(userId: number): Promise<readonly UserIdentityRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.userId === userId)
      .sort((a, b) => a.id - b.id)
  }

  async link(input: LinkIdentityInput): Promise<UserIdentityRecord> {
    const existing = await this.findBySubject(input.provider, input.subject)
    if (existing !== null) return existing

    const record: UserIdentityRecord = {
      id: ++this.seq,
      userId: input.userId,
      provider: input.provider,
      subject: input.subject,
      label: input.label,
      linkedAt: input.now,
      lastUsedAt: null,
    }
    this.byId.set(record.id, record)
    return record
  }

  async unlink(userId: number, identityId: number): Promise<boolean> {
    const record = this.byId.get(identityId)
    if (record === undefined || record.userId !== userId) return false
    this.byId.delete(identityId)
    return true
  }

  async markUsed(identityId: number, now: Date): Promise<void> {
    const record = this.byId.get(identityId)
    if (record !== undefined) this.byId.set(identityId, { ...record, lastUsedAt: now })
  }
}

class MemoryPasskeys implements PasskeyRepository {
  private readonly byId = new Map<number, PasskeyRecord>()
  private seq = 0

  async findByCredentialId(credentialId: string): Promise<PasskeyRecord | null> {
    for (const record of this.byId.values()) {
      if (record.credentialId === credentialId) return record
    }
    return null
  }

  async listForUser(userId: number): Promise<readonly PasskeyRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.userId === userId)
      .sort((a, b) => a.id - b.id)
  }

  async create(input: NewPasskey): Promise<PasskeyRecord> {
    const record: PasskeyRecord = {
      id: ++this.seq,
      userId: input.userId,
      credentialId: input.credentialId,
      publicKey: input.publicKey,
      signCount: input.signCount,
      label: input.label,
      transports: input.transports,
      createdAt: input.now,
      lastUsedAt: null,
    }
    this.byId.set(record.id, record)
    return record
  }

  async remove(userId: number, passkeyId: number): Promise<boolean> {
    const record = this.byId.get(passkeyId)
    if (record === undefined || record.userId !== userId) return false
    this.byId.delete(passkeyId)
    return true
  }

  async markUsed(passkeyId: number, signCount: number, now: Date): Promise<void> {
    const record = this.byId.get(passkeyId)
    if (record !== undefined) {
      this.byId.set(passkeyId, { ...record, signCount, lastUsedAt: now })
    }
  }
}

export function createMemoryStore(): AccountStore {
  return {
    accounts: new MemoryAccounts(),
    sessions: new MemorySessions(),
    tokens: new MemoryCredentialTokens(),
    loginAttempts: new MemoryLoginAttempts(),
    remember: new MemoryRememberTokens(),
    identities: new MemoryUserIdentities(),
    passkeys: new MemoryPasskeys(),
  }
}
