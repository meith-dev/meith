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
  readonly meithVersion: string
  readonly pluginApiMajor: number
  readonly themeApiMajor: number
}

export interface CompatibilityResult {
  readonly compatible: boolean
  readonly reason: string | null
}

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

export interface InstalledEntry {
  readonly enabled: boolean
  readonly version: string | null
}

export interface ListingStatusInput extends CompatibilityCheck {
  readonly installed: InstalledEntry | null
}

export interface ListingStatusResult {
  readonly status: ListingStatus
  readonly incompatibleReason: string | null
}

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
