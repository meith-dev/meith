/**
 * @forum/accounts — identity: credential hashing, opaque tokens, and (later)
 * the account/session repositories and register/login/reset services.
 *
 * The crypto primitives are pure and runtime-agnostic (Web Crypto + hash-wasm),
 * so they are unit-tested directly with no database.
 */

export {
  CURRENT_PASSWORD_POLICY,
  hashPassword,
  verifyPassword,
  needsRehash,
  parseArgon2Params,
  type PasswordPolicy,
  type Argon2Params,
} from './crypto/password'

export {
  generateToken,
  hashToken,
  timingSafeEqual,
} from './crypto/tokens'

export {
  IdentityService,
  type IdentityDeps,
  type RegisterInput,
  type RegisterResult,
  type RequestContext,
  type LoginResult,
  type ResetRequest,
} from './service'

export {
  SessionService,
  type SessionServiceDeps,
  type RememberedLogin,
  type ResumeOutcome,
} from './session-service'

export { createMemoryStore } from './memory-repos'

export { foldIdentifier } from './case-fold'

export { DEFAULT_AUTH_POLICY, type AuthPolicy } from './policy'

export {
  BAN_FILTER_TYPES,
  assertUsableFilter,
  matchBanFilter,
  type BanFilter,
  type BanFilterSubject,
  type BanFilterType,
} from './ban-filter'

export { BanService, type BanInput, type BanServiceDeps } from './ban-service'

export { MemoryBanFilters, MemoryBans } from './memory-bans'

export type {
  BanRecord,
  BanRepository,
  BanFilterRepository,
  CreateBanInput,
  AccountRecord,
  AccountState,
  AccountStore,
  AccountRepository,
  SessionRepository,
  SessionRecord,
  SessionLocation,
  RememberTokenRepository,
  RememberRotation,
  CredentialTokenRepository,
  CredentialPurpose,
  LoginAttemptRepository,
  AuthConfig,
  Clock,
  NewAccount,
} from './ports'
