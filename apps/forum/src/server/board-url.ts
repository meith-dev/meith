import 'server-only'

/**
 * The board's own address, for the app tier.
 *
 * A thin wrapper over `resolveBoardUrl` that supplies the two things the pure
 * function cannot fetch: the environment, and the settings snapshot. It exists
 * so that "what is this board's origin" is one `await` at every call site rather
 * than five copies of `env.APP_URL?.replace(/\/+$/, '') ?? ''` — which is what
 * it replaced, and which had already drifted into three subtly different
 * fallbacks: empty string in the mail paths, `http://localhost:3000` in the feed
 * builder, and a bare `??` with no trimming in the layout.
 *
 * Reads through `getSettings()`, which is cached per request under the settings
 * tag, so a page building twenty absolute URLs costs one query rather than
 * twenty. The worker does not come through here — `resolveMailBrand` resolves
 * the same value from the snapshot it already loads, because there is no Next
 * data cache in a plain Node process.
 */
import { env } from '@meith/core'
import { resolveBoardUrl, type BoardUrlResolution } from '@meith/settings'

import { getSettings } from './settings'

/**
 * The origin and where it came from.
 *
 * `source` is what the settings screen and the health view need: `environment`
 * means `APP_URL` is set and the box on the board settings screen is inert, and
 * saying so is the difference between a configuration screen and a decoy.
 */
export async function boardUrlResolution(): Promise<BoardUrlResolution> {
  return resolveBoardUrl({ environment: env, settings: await getSettings() })
}

/**
 * Just the origin, empty when the board does not know its own address.
 *
 * Empty rather than a guess, deliberately, and the callers act on it: the mail
 * paths send written instructions instead of a dead link (F55), and the feed
 * builder substitutes a localhost origin so an obviously-local URL in a
 * development build is diagnosable where `href=""` is not.
 */
export async function boardUrl(): Promise<string> {
  return (await boardUrlResolution()).url
}
