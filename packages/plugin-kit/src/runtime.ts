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
    readonly primary?: boolean | undefined
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

export interface PluginNotify {
  send(input: {
    readonly userId: number
    readonly kind: string
    readonly subject?: string | undefined
    readonly subjectKey?: string | undefined
    readonly subjectArgs?: Readonly<Record<string, string | number>> | undefined
    readonly body?: string | undefined
    readonly bodyKey?: string | undefined
    readonly bodyArgs?: Readonly<Record<string, string | number>> | undefined
    readonly href?: string | undefined
    readonly dedupeKey?: string | undefined
  }): Promise<void>
}

export function unavailablePluginNotify(reason: string): PluginNotify {
  const refuse = async (): Promise<never> => {
    throw new Error(`Plugin notifications are unavailable: ${reason}`)
  }
  return { send: refuse }
}

const MAX_NOTIFY_SUBJECT = 200
const MAX_NOTIFY_BODY = 2_000

export interface PluginNotifyKindInput {
  readonly key: string
  readonly title: string
  readonly titleKey?: string | undefined
  readonly description: string
  readonly descriptionKey?: string | undefined
  readonly emailByDefault?: boolean | undefined
  readonly pushByDefault?: boolean | undefined
}

export interface PluginNotificationKindSpec {
  readonly id: string
  readonly title: string
  readonly titleKey?: string
  readonly description: string
  readonly descriptionKey?: string
  readonly audience: 'member'
  readonly emailByDefault: boolean
  readonly emailConfigurable: true
  readonly pushByDefault: boolean
  readonly pushConfigurable: true
}

export interface PluginNotifyBackend {
  raise(input: {
    readonly userId: number
    readonly kind: string
    readonly data: Readonly<Record<string, string>>
    readonly href?: string | null
    readonly dedupeKey?: string | null
  }): Promise<unknown>
}

export function pluginNotificationKindSpecs(
  pluginKey: string,
  kinds: readonly PluginNotifyKindInput[],
): readonly PluginNotificationKindSpec[] {
  return kinds.map((kind) => ({
    id: `plugin.${pluginKey}.${kind.key}`,
    title: kind.title,
    ...(kind.titleKey === undefined ? {} : { titleKey: kind.titleKey }),
    description: kind.description,
    ...(kind.descriptionKey === undefined ? {} : { descriptionKey: kind.descriptionKey }),
    audience: 'member',
    emailByDefault: kind.emailByDefault ?? true,
    emailConfigurable: true,
    pushByDefault: kind.pushByDefault ?? false,
    pushConfigurable: true,
  }))
}

export function pluginNotify(
  pluginKey: string,
  kinds: readonly PluginNotifyKindInput[],
  backend: PluginNotifyBackend,
): PluginNotify {
  const declared = new Set(kinds.map((kind) => kind.key))

  return {
    async send(input) {
      if (!declared.has(input.kind)) {
        throw new Error(
          `plugin "${pluginKey}": notification kind "${input.kind}" is not declared. ` +
            'A kind must be in the plugin definition — that is what puts it on the ' +
            'member’s preferences screen.',
        )
      }
      if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
        throw new Error(`plugin "${pluginKey}": a notification needs a real user id.`)
      }

      const hasSubject = input.subject !== undefined
      const hasSubjectKey = input.subjectKey !== undefined
      if (hasSubject === hasSubjectKey) {
        throw new Error(
          `plugin "${pluginKey}": a notification needs exactly one of subject or subjectKey.`,
        )
      }

      const subject = input.subject?.trim() ?? ''
      if (hasSubject && (subject === '' || subject.length > MAX_NOTIFY_SUBJECT)) {
        throw new Error(
          `plugin "${pluginKey}": a notification subject is 1 to ${MAX_NOTIFY_SUBJECT} characters.`,
        )
      }

      const subjectKey = input.subjectKey?.trim() ?? ''
      if (hasSubjectKey && subjectKey === '') {
        throw new Error(`plugin "${pluginKey}": a notification subjectKey cannot be empty.`)
      }

      const body = (input.body ?? '').trim()
      const hasBody = input.body !== undefined
      const hasBodyKey = input.bodyKey !== undefined
      if (hasBody && hasBodyKey) {
        throw new Error(`plugin "${pluginKey}": a notification cannot have both body and bodyKey.`)
      }
      const bodyKey = input.bodyKey?.trim() ?? ''
      if (hasBodyKey && bodyKey === '') {
        throw new Error(`plugin "${pluginKey}": a notification bodyKey cannot be empty.`)
      }
      if (body.length > MAX_NOTIFY_BODY) {
        throw new Error(
          `plugin "${pluginKey}": a notification body caps at ${MAX_NOTIFY_BODY} characters — ` +
            'link to a page for anything longer.',
        )
      }

      if (
        input.href !== undefined &&
        (!input.href.startsWith('/') || input.href.startsWith('//'))
      ) {
        throw new Error(
          `plugin "${pluginKey}": a notification links within the board — the href must ` +
            'start with a single "/".',
        )
      }

      await backend.raise({
        userId: input.userId,
        kind: `plugin.${pluginKey}.${input.kind}`,
        data: {
          ...(hasSubject
            ? { subject }
            : {
                subjectKey,
                ...(input.subjectArgs === undefined
                  ? {}
                  : { subjectArgs: JSON.stringify(input.subjectArgs) }),
              }),
          ...(hasBody
            ? body === ''
              ? {}
              : { body }
            : !hasBodyKey
              ? {}
              : {
                  bodyKey,
                  ...(input.bodyArgs === undefined
                    ? {}
                    : { bodyArgs: JSON.stringify(input.bodyArgs) }),
                }),
        },
        href: input.href ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })
    },
  }
}
