/**
 * The capabilities a running plugin is handed, beyond its resolved settings.
 *
 * These are types only. The implementations live with the host — a plugin
 * receives them on its runtime context and cannot construct its own, which is
 * what keeps every write inside the host's checks.
 */

/** A group membership this plugin granted, and when it lapses. */
export interface PluginGrantRow {
  readonly groupKey: string
  readonly expiresAt: Date
}

/**
 * Time-limited membership of a usergroup — the only write a plugin gets
 * against the board's own data.
 *
 * Every method goes through the host, which refuses: a group that does not
 * exist, a group the operator has not marked grantable, a system or staff
 * group, a group whose permissions carry administrative or moderation power,
 * and an expiry that is absent, in the past, or more than two years out. A
 * grant is always an *additive secondary* membership — never the primary or
 * display group — and always expires: access ends at `until` even if nothing
 * ever runs again.
 */
export interface PluginGrants {
  /** Put a user in a group until a date. Extends an earlier grant of its own. */
  grant(input: {
    readonly userId: number
    readonly groupKey: string
    readonly until: Date
    readonly reason: string
  }): Promise<void>

  /** Move an existing grant's expiry forward. Never shortens it. */
  extend(input: {
    readonly userId: number
    readonly groupKey: string
    readonly until: Date
  }): Promise<void>

  /** Remove a grant this plugin made. A membership someone else granted is not touchable. */
  revoke(input: {
    readonly userId: number
    readonly groupKey: string
    readonly reason: string
  }): Promise<void>

  /** The grants this plugin currently holds for a user. */
  list(userId: number): Promise<readonly PluginGrantRow[]>
}

/** The shape handed out where no database exists (fixture mode). Every call rejects. */
export function unavailablePluginGrants(reason: string): PluginGrants {
  const refuse = async (): Promise<never> => {
    throw new Error(`Plugin grants are unavailable: ${reason}`)
  }
  return { grant: refuse, extend: refuse, revoke: refuse, list: refuse }
}

/**
 * A plugin's window onto its own tables — the ones its migrations created
 * under the `plugin_<key>_` prefix.
 *
 * Parameterised only: values travel as `$1`, `$2`, … and there is no
 * string-building helper on purpose, so the ordinary path is the safe one.
 * Every statement runs under a database-side `statement_timeout`, which is a
 * limit that actually holds — unlike a JavaScript "timeout", which cannot
 * abort anything.
 *
 * This is a contract, not a sandbox: plugin code runs in the host's process
 * and its queries are not rewritten. The prefix rule is enforced where it can
 * be — on what migrations may create — and stated honestly here for the rest.
 */
export interface PluginData {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]>

  /** The first row, or null. For the `limit 1` shape every lookup takes. */
  one<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T | null>

  /**
   * Everything inside `work` commits together or not at all. A nested `tx`
   * joins the outer transaction rather than opening a second one.
   */
  tx<T>(work: (data: PluginData) => Promise<T>): Promise<T>
}

/** The shape handed out where no database exists (fixture mode). Every call rejects. */
export function unavailablePluginData(reason: string): PluginData {
  const refuse = async (): Promise<never> => {
    throw new Error(`Plugin data access is unavailable: ${reason}`)
  }
  return { query: refuse, one: refuse, tx: refuse }
}

/**
 * A member, as a plugin is allowed to see one: an id and a public name.
 * Deliberately nothing else — no email, no state, no groups. The same
 * philosophy as hook payloads carrying a `ViewerRef` rather than an `Actor`.
 */
export interface PluginUserRef {
  readonly userId: number
  readonly username: string
}

/**
 * Resolving members a plugin's own records point at, or that its UI asks for
 * by name — "award this to @name" needs an id before anything can be stored
 * against it. Lookups exclude deleted accounts; anything richer than
 * existence is not a plugin's to know.
 */
export interface PluginUsers {
  byUsername(username: string): Promise<PluginUserRef | null>
  byId(userId: number): Promise<PluginUserRef | null>
}

/** The shape handed out where no database exists (fixture mode). Every call rejects. */
export function unavailablePluginUsers(reason: string): PluginUsers {
  const refuse = async (): Promise<never> => {
    throw new Error(`Plugin user lookup is unavailable: ${reason}`)
  }
  return { byUsername: refuse, byId: refuse }
}
