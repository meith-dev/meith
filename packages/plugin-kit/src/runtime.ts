
export interface PluginGrantRow {
  readonly groupKey: string
  readonly expiresAt: Date
}

export interface PluginGrants {
  grant(input: {
    readonly userId: number
    readonly groupKey: string
    readonly until: Date
    readonly reason: string
  }): Promise<void>

  extend(input: {
    readonly userId: number
    readonly groupKey: string
    readonly until: Date
  }): Promise<void>

  revoke(input: {
    readonly userId: number
    readonly groupKey: string
    readonly reason: string
  }): Promise<void>

  list(userId: number): Promise<readonly PluginGrantRow[]>
}

export function unavailablePluginGrants(reason: string): PluginGrants {
  const refuse = async (): Promise<never> => {
    throw new Error(`Plugin grants are unavailable: ${reason}`)
  }
  return { grant: refuse, extend: refuse, revoke: refuse, list: refuse }
}

export interface PluginData {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]>

  one<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T | null>

  tx<T>(work: (data: PluginData) => Promise<T>): Promise<T>
}

export function unavailablePluginData(reason: string): PluginData {
  const refuse = async (): Promise<never> => {
    throw new Error(`Plugin data access is unavailable: ${reason}`)
  }
  return { query: refuse, one: refuse, tx: refuse }
}

export interface PluginUserRef {
  readonly userId: number
  readonly username: string
}

export interface PluginUsers {
  byUsername(username: string): Promise<PluginUserRef | null>
  byId(userId: number): Promise<PluginUserRef | null>
}

export function unavailablePluginUsers(reason: string): PluginUsers {
  const refuse = async (): Promise<never> => {
    throw new Error(`Plugin user lookup is unavailable: ${reason}`)
  }
  return { byUsername: refuse, byId: refuse }
}
