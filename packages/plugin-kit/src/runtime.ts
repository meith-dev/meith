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
