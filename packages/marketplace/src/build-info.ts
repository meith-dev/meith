import { parseApiVersion, THEME_API_VERSION } from '@meith/theme-kit'

/**
 * This board's own release version, checked against a listing's `meith`
 * range. Duplicated the same way `CODE_VERSION` already is across
 * apps/cli/src/upgrade.ts, apps/community/src/server/upgrade-notice.ts and
 * packages/create-meith/src/bin.ts — see docs/release.md — and kept honest
 * by the same `scripts/release-check.mjs`.
 */
export const MEITH_VERSION = '0.21.1'

/**
 * The theme-kit major this build implements, read from the single place
 * that already declares it rather than duplicated as a literal.
 */
export const THEME_API_MAJOR = parseApiVersion(THEME_API_VERSION).major

/**
 * The plugin-kit major this build implements. Unlike theme-kit, plugin-kit
 * exports no equivalent constant — a plugin's own `apiVersion` is a free
 * string nothing currently checks (see docs/plugin-api.md's Versioning
 * section, which describes the policy without a constant enforcing it).
 * Both kits are pre-1.0, so this is 0 until plugin-kit ships a major of its
 * own; bump it by hand alongside that, the same way this file's other
 * constant is bumped by hand at every release.
 */
export const PLUGIN_API_MAJOR = 0
