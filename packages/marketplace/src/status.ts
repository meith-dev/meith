import { compareSemver, satisfiesMeithRange } from './range'
import type { ListingKind } from './schema'

export type ListingStatus =
  | 'active'
  | 'installed-disabled'
  | 'not-installed'
  | 'update-available'
  | 'incompatible'

export interface CompatibilityCheck {
  readonly kind: ListingKind
  readonly version: string
  readonly apiVersion: number
  readonly meith: string
}

export interface BuildInfo {
  /** This board's own release version — `CODE_VERSION`, checked against `meith`. */
  readonly meithVersion: string
  /** The plugin-kit major this build implements, checked against a plugin listing's `apiVersion`. */
  readonly pluginApiMajor: number
  /** The theme-kit major this build implements, checked against a theme listing's `apiVersion`. */
  readonly themeApiMajor: number
}

export interface CompatibilityResult {
  readonly compatible: boolean
  /** Set exactly when `compatible` is false — why, in words a board operator can act on. */
  readonly reason: string | null
}

/** Checks a listing's declared `apiVersion` and `meith` range against this build. */
export function checkCompatibility(
  listing: CompatibilityCheck,
  build: BuildInfo,
): CompatibilityResult {
  const wantedMajor = listing.kind === 'plugin' ? build.pluginApiMajor : build.themeApiMajor
  const apiOk = listing.apiVersion === wantedMajor
  const meithOk = satisfiesMeithRange(listing.meith, build.meithVersion)

  if (apiOk && meithOk) return { compatible: true, reason: null }

  const reasons: string[] = []
  if (!apiOk) {
    reasons.push(
      `built against ${listing.kind === 'plugin' ? 'plugin' : 'theme'}-kit major ${listing.apiVersion}, ` +
        `this board runs major ${wantedMajor}`,
    )
  }
  if (!meithOk) {
    reasons.push(`needs meith ${listing.meith}, this board runs ${build.meithVersion}`)
  }
  return { compatible: false, reason: reasons.join('; ') }
}

/** What this build already knows about a listing's key, if anything. */
export interface InstalledEntry {
  readonly enabled: boolean
  /** The compiled version to compare the feed against, or null when there is none to compare. */
  readonly version: string | null
}

export interface ListingStatusInput extends CompatibilityCheck {
  readonly installed: InstalledEntry | null
}

export interface ListingStatusResult {
  readonly status: ListingStatus
  /** Set exactly when `status` is 'incompatible'. */
  readonly incompatibleReason: string | null
}

/**
 * The five statuses the Browse tab renders, computed against what this build
 * actually contains — never against what installing would do, because this
 * screen does not install anything.
 *
 * An installed plugin or theme that is merely *running* is never recomputed
 * to 'incompatible' on the strength of the catalog's opinion of its current
 * listing — what is already active keeps being reported as active. Incompat-
 * ibility only gates two things: a listing nothing has installed, and an
 * update this board would otherwise offer. That is also why a theme (whose
 * compiled version this build cannot see — `defineTheme` carries none) never
 * reports 'update-available': there is nothing reliable to compare against,
 * so it settles on active/disabled once compatibility has been read for the
 * not-installed case.
 */
export function computeListingStatus(
  input: ListingStatusInput,
  build: BuildInfo,
): ListingStatusResult {
  const compatibility = checkCompatibility(input, build)

  if (input.installed === null) {
    return compatibility.compatible
      ? { status: 'not-installed', incompatibleReason: null }
      : { status: 'incompatible', incompatibleReason: compatibility.reason }
  }

  const hasNewerListedVersion =
    input.installed.version !== null && compareSemver(input.version, input.installed.version) > 0

  if (hasNewerListedVersion) {
    return compatibility.compatible
      ? { status: 'update-available', incompatibleReason: null }
      : { status: 'incompatible', incompatibleReason: compatibility.reason }
  }

  return {
    status: input.installed.enabled ? 'active' : 'installed-disabled',
    incompatibleReason: null,
  }
}
