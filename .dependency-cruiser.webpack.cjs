/**
 * A resolver alias for `pnpm depcruise`, and nothing else.
 *
 * dependency-cruiser reads path aliases from one tsconfig, and this repo's is
 * `tsconfig.base.json` — which holds the `@forum/<name>` workspace aliases and
 * deliberately does not hold `@/*`, because that one belongs to the app alone
 * (`apps/forum/tsconfig.json`). Putting `@/*` in the base config would let any
 * package resolve `@/…` into the app, which is a dependency direction this
 * repo does not permit.
 *
 * The consequence of leaving it unresolvable is not a loud failure. It is that
 * every `@/…` edge from `app/` is invisible, so a module under `src/`
 * imported only by a page or a route handler looks like dead code — and any
 * rule matching a path silently never fires on those edges. The `tsConfig` note
 * in the main config describes the same failure mode from the other direction:
 * a guard reporting a clean run because it cannot see the graph.
 *
 * It surfaced with F76, whose two view modules are the first in this repo
 * imported from `app/` and nowhere else. Adding them to the orphan exemption
 * list would have silenced the warning and left the blindness in place.
 *
 * A webpack config rather than an `enhancedResolveOptions.alias`, because
 * dependency-cruiser's schema does not accept the latter — this is the
 * supported way in.
 */
const { resolve } = require('node:path')

module.exports = {
  resolve: {
    alias: { '@': resolve(__dirname, 'apps/forum/src') },
    /*
     * Repeated here because supplying a webpack config *replaces* the
     * resolver's defaults rather than adding to them. Without this the module
     * count drops by a fifth — TypeScript sources stop resolving, and the tool
     * reports a clean run over a graph with a hole in it, which is the exact
     * failure this file exists to fix.
     */
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  },
}
