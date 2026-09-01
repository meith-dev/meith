import { isSlotName, SLOT_NAMES, type SlotName } from './slots'

export const THEME_API_VERSION = '0.20'

export type Stability = 'stable' | 'provisional' | 'deprecated'

export const SLOT_STABILITY: Readonly<Record<SlotName, Stability>> = {
  Shell: 'stable',
  Header: 'stable',
  UserPanel: 'stable',
  Navigation: 'stable',
  Footer: 'stable',
  Notice: 'stable',
  Announcement: 'stable',

  BoardIndex: 'stable',
  CategoryBlock: 'stable',
  ForumRow: 'stable',
  BoardStats: 'stable',
  WhoIsOnline: 'stable',
  LatestThreads: 'stable',
  LatestPosts: 'stable',

  ForumDisplay: 'stable',
  ThreadRow: 'stable',
  SubforumList: 'stable',
  Pagination: 'stable',

  ThreadView: 'stable',
  PostBit: 'stable',
  PostActions: 'stable',
  QuickReply: 'stable',

  PostForm: 'stable',
  EditorToolbar: 'stable',

  MemberProfile: 'stable',

  SearchForm: 'stable',
  SearchResults: 'stable',

  DiscoveryView: 'stable',

  PanelShell: 'stable',
  PanelNav: 'stable',
  PanelPage: 'stable',
  PanelSection: 'stable',

  AuthPage: 'stable',

  ForumJump: 'stable',

  RedirectNotice: 'stable',
  ErrorNotice: 'stable',
}

export interface Deprecation {
  readonly kind: 'slot' | 'field'
  readonly name: string
  readonly since: string
  readonly removeIn: string
  readonly replacement: string | null
  readonly reason: string
}

export const DEPRECATIONS: readonly Deprecation[] = [
  {
    kind: 'field',
    name: 'PostBitModel.quoteSource',
    since: '0.5',
    removeIn: '1.0',
    replacement: 'PostBitModel.post.id',
    reason:
      'It carried a post’s Markdown source to the client so the multiquote ' +
      'button could assemble a quote in the browser. Quoting resolves a post ' +
      'by id on the server now — which re-checks who may see it and cannot go ' +
      'stale — so this ships every post’s full source to every reader for ' +
      'nobody. No theme has ever rendered it; the field says so itself.',
  },
]

export interface ApiVersion {
  readonly major: number
  readonly minor: number
}

export function parseApiVersion(value: string): ApiVersion {
  const match = /^(\d+)\.(\d+)$/.exec(value)
  if (match === null) {
    throw new Error(
      `theme-kit: "${value}" is not an API version. Expected major.minor, e.g. "1.0".`,
    )
  }
  return { major: Number(match[1]), minor: Number(match[2]) }
}

export function compareApiVersions(a: string, b: string): number {
  const left = parseApiVersion(a)
  const right = parseApiVersion(b)
  return left.major - right.major || left.minor - right.minor
}

export function assertDeprecationPolicy(
  deprecations: readonly Deprecation[],
  stability: Readonly<Record<string, Stability>>,
  currentVersion: string,
): void {
  const current = parseApiVersion(currentVersion)
  const scheduledSlots = new Set<string>()

  for (const entry of deprecations) {
    const where = `${entry.kind} "${entry.name}"`

    if (entry.kind === 'slot') {
      if (!isSlotName(entry.name)) {
        throw new Error(
          `theme-kit: deprecation for ${where} names a slot that does not exist. ` +
            'Remove the entry, or restore the slot it points at.',
        )
      }
      scheduledSlots.add(entry.name)
    } else if (!/^[A-Z]\w*\.\w+$/.test(entry.name)) {
      throw new Error(`theme-kit: deprecation for ${where} must name a field as Model.field.`)
    }

    const since = parseApiVersion(entry.since)
    const removeIn = parseApiVersion(entry.removeIn)

    if (removeIn.minor !== 0) {
      throw new Error(
        `theme-kit: ${where} is scheduled for removal in ${entry.removeIn}, which is ` +
          'a minor release. Minors are additive; removals land in a major.',
      )
    }
    if (removeIn.major <= since.major) {
      throw new Error(
        `theme-kit: ${where} was deprecated in ${entry.since} and removed in ` +
          `${entry.removeIn}. A deprecation must leave at least one major to migrate in.`,
      )
    }
    if (current.major >= removeIn.major) {
      throw new Error(
        `theme-kit: ${where} was scheduled for removal in ${entry.removeIn} and this ` +
          `build is ${currentVersion}. Remove it, or move the schedule out — a ` +
          'deadline that passes quietly is how a deprecation becomes permanent.',
      )
    }
    if (entry.reason.trim() === '') {
      throw new Error(`theme-kit: ${where} is deprecated with no reason given.`)
    }
  }

  for (const [name, mark] of Object.entries(stability)) {
    if (mark === 'deprecated' && !scheduledSlots.has(name)) {
      throw new Error(
        `theme-kit: slot "${name}" is marked deprecated but has no entry in ` +
          'DEPRECATIONS, so nothing tells a theme author when it goes or what replaces it.',
      )
    }
    if (mark !== 'deprecated' && scheduledSlots.has(name)) {
      throw new Error(
        `theme-kit: slot "${name}" is scheduled for removal but is still marked ` +
          `"${mark}". Mark it deprecated so themes and the generated docs say so.`,
      )
    }
  }
}

export function deprecationsFor(
  name: string,
  deprecations: readonly Deprecation[] = DEPRECATIONS,
): readonly Deprecation[] {
  return deprecations.filter(
    (entry) => entry.name === name || entry.name.startsWith(`${name}Model.`),
  )
}

export function requiredSlots(
  stability: Readonly<Record<string, Stability>> = SLOT_STABILITY,
): readonly SlotName[] {
  return SLOT_NAMES.filter((name) => stability[name] !== 'provisional')
}

export interface ThemeContractReport {
  readonly version: string
  readonly missing: readonly SlotName[]
  readonly provisionalInUse: readonly SlotName[]
  readonly deprecatedInUse: readonly Deprecation[]
  readonly satisfies: boolean
}

export function checkThemeContract(
  theme: { readonly slots: Readonly<Record<string, unknown>> },
  stability: Readonly<Record<string, Stability>> = SLOT_STABILITY,
  deprecations: readonly Deprecation[] = DEPRECATIONS,
): ThemeContractReport {
  const filled = (name: SlotName): boolean => theme.slots[name] !== undefined

  const missing = requiredSlots(stability).filter((name) => !filled(name))
  const provisionalInUse = SLOT_NAMES.filter(
    (name) => stability[name] === 'provisional' && filled(name),
  )
  const deprecatedInUse = deprecations.filter(
    (entry) => entry.kind === 'slot' && isSlotName(entry.name) && filled(entry.name),
  )

  return {
    version: THEME_API_VERSION,
    missing,
    provisionalInUse,
    deprecatedInUse,
    satisfies: missing.length === 0,
  }
}

export function assertThemeContract(
  theme: { readonly key: string; readonly slots: Readonly<Record<string, unknown>> },
  stability: Readonly<Record<string, Stability>> = SLOT_STABILITY,
): ThemeContractReport {
  const report = checkThemeContract(theme, stability)
  if (!report.satisfies) {
    throw new Error(
      `Theme "${theme.key}" does not satisfy theme-kit v${THEME_API_VERSION}: ` +
        `${report.missing.length} required slot(s) unfilled — ${report.missing.join(', ')}. ` +
        'Implement them, or extend a theme that does.',
    )
  }
  return report
}
