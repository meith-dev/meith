/**
 * F77 — the slot-contract freeze, stated as data rather than as a promise.
 *
 * Phases 2–7 built the slot registry and the view models opportunistically: a
 * page needed a region, a region needed a model, and both were free to change
 * because the only consumer was in this repository. That stops here. F78 ships a
 * second theme and F79 lets a plugin fill a slot, so from this point a rename is
 * somebody else's broken board.
 *
 * A freeze that is only a paragraph in a document is not a freeze. What is here
 * is the machinery that makes the promise checkable:
 *
 *  - `SLOT_STABILITY` says, **for every slot**, whether the freeze covers it. The record
 *    is exhaustive over `SlotName`, so adding a slot without classifying it fails
 *    `pnpm typecheck` — a new slot cannot arrive quietly as "stable".
 *  - `DEPRECATIONS` is the machine-readable removal schedule, and
 *    `assertDeprecationPolicy` refuses a schedule that contradicts itself or has
 *    fallen due. A deprecation notice nobody acts on is how an API accumulates
 *    twelve years of "will be removed in the next major".
 *  - `checkThemeContract` answers whether a theme satisfies the contract, which is what
 *    `apps/community` asserts at boot and what the ACP's theme screen can show.
 *  - `scripts/theme-api-docs.mjs` renders all of it to `docs/theme-slots.md` and
 *    fails the build when the file and the code disagree, so a contract change
 *    cannot be reviewed without its documentation in the same diff.
 *
 * ## Why "stable" is not simply "every slot"
 *
 * Two slots — `QuickReply` and `EditorToolbar` — are the F45 editor islands, and
 * F45 is not built. Nothing renders them, so nothing has ever handed their models
 * to a component; freezing a props contract that has never been passed to
 * anything is guessing with a version number attached. They stay `provisional`:
 * named, documented, and explicitly outside the compatibility promise until the
 * feature that renders them exists. A theme is not required to implement them and
 * is warned, not broken, if their shape changes.
 *
 * That distinction is the whole reason this file is a record and not a boolean.
 * The alternative — freeze everything, then break it — is worse than admitting
 * which parts are not ready.
 */

import { SLOT_NAMES, isSlotName, type SlotName } from './slots'

/**
 * The version of the theme contract this build ships.
 *
 * `major.minor`, and the two halves mean different things:
 *
 *  - **minor** — additive only. A new slot, a new optional field, a new stable
 *    export. Every existing theme keeps working, so upgrading is a redeploy.
 *  - **major** — a removal or a rename may land. Only things scheduled through
 *    `DEPRECATIONS` at least one minor earlier may go.
 *
 * Not a patch component: this is a type-level contract with no runtime behaviour
 * to fix. A bug in `resolveTheme` is a package version, not an API version.
 *
 * **Why the major is still `0`.** Meith has not been released. Nothing in here
 * has ever been somebody else's dependency, and there is no installed board in
 * the world for a rename to break. The freeze below is real — every rule it
 * states is enforced by the code in this file and has been since F77 — but the
 * major it counts toward is `1.0`, and that lands with the product rather than
 * ahead of it. A `1` shipped before the first release is a compatibility promise
 * made to nobody, and the first thing it costs is the removal that has to break
 * it.
 *
 * **0.2** added the optional plugin-region fields F80 needs
 * (`BoardIndexModel.regions.plugins` and its siblings). Optional, additive, no
 * slot renamed and none removed — a theme written against 0.1 compiles and runs
 * unchanged, which is the promise a minor is. It is also the first exercise of
 * this policy on something real rather than on a fixture.
 *
 * **0.3** added F71's `Announcement` slot and the two optional
 * `regions.announcements` fields that place it. A new slot is additive by
 * construction — no theme is required to have implemented one that did not
 * exist — and the region fields follow 0.2's rule. The second exercise of the
 * policy, and the first time it covered a new *slot* rather than a new field.
 *
 * **0.4** added the optional `regions.tools` on `ThreadViewModel` and
 * `CommunityDisplayModel`. Same rule as 0.2's, and it is worth saying what it
 * bought: the thread-scoped controls a route renders — follow, rate, vote,
 * moderate — had nowhere in the contract to go, so they were stacked *above*
 * the slot, which put four widgets ahead of the `<h1>` naming the thread they
 * acted on. A region is what lets a theme place them where they belong.
 *
 * **0.5** added `regions.afterContent` beside it on both, because "where they
 * belong" turned out to be two places rather than one. A poll and a
 * moderator's bar precede the posts; rating a thread and following a community
 * follow them. Asking somebody to rate a discussion above its first post, or
 * to subscribe to a community above its thread list, is asking for a verdict on
 * something they have not read.
 *
 * **0.8** added the optional `FooterModel.poweredBy`, so the board can say what
 * it runs on and link to it. Additive under 0.2's rule — a theme written against
 * any earlier minor renders exactly what it did before. It is a `LinkModel`
 * rather than a string each theme hardcodes because the app owns the words and
 * the URL, which is the same reason `links` is one.
 *
 * **0.9** added the `LatestThreads` and `LatestPosts` slots and the optional
 * `BoardIndexModel.regions.latest` that places them. Two new slots and one
 * optional field — additive by construction, since no theme can have
 * implemented a slot that did not exist, and a theme written against 0.8
 * compiles and renders an index without a sidebar. The third exercise of the
 * policy on a new slot, and the first where the *page* rather than the theme
 * gained a moving part: the region refreshes itself while somebody is looking
 * at it, and the slots stay `server` regardless, because what polls is an
 * island the app owns and what it fetches is these two slots rendered again.
 */
export const THEME_API_VERSION = '0.9'

/**
 * How much of a promise a slot carries.
 *
 * `stable` — the freeze covers it. Its name, its kind and its model's existing
 * fields do not change before the next major, and a change to any of them goes
 * through `DEPRECATIONS` first.
 *
 * `provisional` — named and documented, outside the promise. It exists so themes
 * can see what is coming and so the registry is not retrofitted onto finished
 * pages later (see `slots.ts`), but nothing renders it yet and its model may
 * change in a minor release. Every provisional slot names the feature that will
 * make it stable.
 *
 * `deprecated` — still works, scheduled for removal, with an entry in
 * `DEPRECATIONS` saying when and what to use instead. Enforced in both
 * directions: a slot marked deprecated here with no entry there is a warning
 * nobody can act on, and an entry there for a slot not marked here is a removal
 * nobody was told about.
 */
export type Stability = 'stable' | 'provisional' | 'deprecated'

/**
 * Every slot's place in the freeze.
 *
 * Exhaustive by construction — `Record<SlotName, Stability>` — which is the
 * mechanism, not the annotation. Adding a slot to `SLOTS` and not to this map is
 * a type error naming the slot, so classifying it is a step somebody has to take
 * deliberately rather than a default they inherit.
 */
export const SLOT_STABILITY: Readonly<Record<SlotName, Stability>> = {
  Shell: 'stable',
  Header: 'stable',
  UserPanel: 'stable',
  Navigation: 'stable',
  Footer: 'stable',
  Notice: 'stable',
  /* F71. Rendered by both themes and by two real pages from the day it landed. */
  Announcement: 'stable',

  BoardIndex: 'stable',
  CategoryBlock: 'stable',
  CommunityRow: 'stable',
  BoardStats: 'stable',
  WhoIsOnline: 'stable',
  /*
   * Rendered by both themes and by the index from the day they landed, which is
   * the same bar `Announcement` cleared. The models were handed to real
   * components before this line was written — that is what separates these from
   * the provisional pair below.
   */
  LatestThreads: 'stable',
  LatestPosts: 'stable',

  CommunityDisplay: 'stable',
  ThreadRow: 'stable',
  SubcommunityList: 'stable',
  Pagination: 'stable',

  ThreadView: 'stable',
  PostBit: 'stable',
  PostActions: 'stable',
  /* F45. No page renders an island yet; freezing its props would be a guess. */
  QuickReply: 'provisional',

  PostForm: 'stable',
  /* F45, same reason as QuickReply. */
  EditorToolbar: 'provisional',

  MemberProfile: 'stable',

  SearchForm: 'stable',
  CommunityJump: 'stable',

  RedirectNotice: 'stable',
  ErrorNotice: 'stable',
}

/**
 * A scheduled removal.
 *
 * `name` is a slot name for `kind: 'slot'` and a dotted `Model.field` for
 * `kind: 'field'`, because those are the two things a theme can be written
 * against. A whole model is never deprecated on its own — a model exists because
 * a slot is handed it, so removing the slot is the deprecation.
 */
export interface Deprecation {
  readonly kind: 'slot' | 'field'
  /** `PostBit`, or `PostBitModel.legacyId`. */
  readonly name: string
  /** The version it was first marked in. */
  readonly since: string
  /** The **major** version it may be removed in. Never the current one. */
  readonly removeIn: string
  /** What to use instead, or `null` when the capability is simply going. */
  readonly replacement: string | null
  /** Why, in a sentence a theme author can act on. */
  readonly reason: string
}

/**
 * Everything scheduled for removal.
 *
 * The machinery around it is tested against fixtures rather than against this
 * list — a check that only ever runs on the real schedule is a check that has
 * never seen a violation. See `api.test.ts`.
 */
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

/* ------------------------------------------------------------------ *
 * Versions
 * ------------------------------------------------------------------ */

export interface ApiVersion {
  readonly major: number
  readonly minor: number
}

/**
 * Parse `major.minor`, refusing anything else.
 *
 * Strict on purpose. A version string is compared to decide whether a removal
 * has fallen due, and a lenient parser that reads `"2"` as `2.0` or `"v2.1"` as
 * `2.1` eventually reads something as `NaN` — at which point every comparison is
 * false and the policy check passes by never firing.
 */
export function parseApiVersion(value: string): ApiVersion {
  const match = /^(\d+)\.(\d+)$/.exec(value)
  if (match === null) {
    throw new Error(
      `theme-kit: "${value}" is not an API version. Expected major.minor, e.g. "1.0".`,
    )
  }
  return { major: Number(match[1]), minor: Number(match[2]) }
}

/** `a` before `b`? Negative, zero or positive, in the `Array#sort` convention. */
export function compareApiVersions(a: string, b: string): number {
  const left = parseApiVersion(a)
  const right = parseApiVersion(b)
  return left.major - right.major || left.minor - right.minor
}

/* ------------------------------------------------------------------ *
 * The deprecation policy, enforced
 * ------------------------------------------------------------------ */

/**
 * Prove the removal schedule is coherent, and that nothing has outstayed it.
 *
 * Takes its inputs rather than reading the module's own, so the failure cases
 * can be exercised — the shipped list is empty and always will be for a while,
 * and a policy engine whose only test data is `[]` proves nothing (D10).
 *
 * The five refusals, and the failure each one prevents:
 *
 *  - **an unknown slot name** — a deprecation for a slot that does not exist is
 *    a notice pointing at nothing, usually a rename that happened anyway;
 *  - **`removeIn` not later than `since`** — "deprecated in 1.2, removed in 1.2"
 *    gives nobody a release to migrate in, which is the entire point of a cycle;
 *  - **`removeIn` not a major** — a removal in a minor breaks a board on a
 *    redeploy it was told was additive;
 *  - **a removal that has fallen due** — the current version has reached
 *    `removeIn` and the thing is still here. This is the check that makes the
 *    schedule real: it turns "we said we would remove it" into a failing build
 *    at exactly the release that promised to;
 *  - **`stability` and the list disagreeing** — a slot marked `deprecated` with
 *    no schedule, or scheduled without being marked.
 */
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
      throw new Error(
        `theme-kit: deprecation for ${where} must name a field as Model.field.`,
      )
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

/** Every deprecation touching a slot or one of its model's fields. */
export function deprecationsFor(
  name: string,
  deprecations: readonly Deprecation[] = DEPRECATIONS,
): readonly Deprecation[] {
  return deprecations.filter(
    (entry) => entry.name === name || entry.name.startsWith(`${name}Model.`),
  )
}

/* ------------------------------------------------------------------ *
 * What the contract asks of a theme
 * ------------------------------------------------------------------ */

/** Slots a theme must fill to satisfy the contract, in registry order. */
export function requiredSlots(
  stability: Readonly<Record<string, Stability>> = SLOT_STABILITY,
): readonly SlotName[] {
  return SLOT_NAMES.filter((name) => stability[name] !== 'provisional')
}

export interface ThemeContractReport {
  readonly version: string
  /** Stable or deprecated slots the theme (and its ancestors) do not fill. */
  readonly missing: readonly SlotName[]
  /** Provisional slots it does fill. Legal, and worth saying: they may change. */
  readonly provisionalInUse: readonly SlotName[]
  /** Deprecated slots it fills, each with its removal schedule. */
  readonly deprecatedInUse: readonly Deprecation[]
  readonly satisfies: boolean
}

/**
 * Measure a resolved theme against the contract.
 *
 * Deliberately a *report* rather than a throw. Three callers want three
 * different reactions to the same facts: the app fails to boot, the ACP's theme
 * screen lists them, and a theme's own CI test asserts on them. A function that
 * threw would give the second two nothing but a try/catch and a string.
 *
 * `missing` counts deprecated slots as required, which looks backwards and is
 * not: a deprecated slot is still rendered by a page in this version, so a theme
 * that drops it early has a hole in it until the major that removes the page's
 * call.
 */
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

/**
 * Throw unless a theme satisfies the contract.
 *
 * This is what `assertComplete` was reserved for and is not quite the same
 * thing: completeness means every slot, and two of them belong to a feature that
 * does not exist. Requiring those would make the freeze unsatisfiable and the
 * check would be switched off — which is how a boot assertion becomes a comment.
 *
 * Called at module load in the app so a theme with a hole in it fails the
 * deployment rather than the first request that happens to reach the page.
 */
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
