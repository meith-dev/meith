'use server'

/**
 * The one action behind the index sidebar's live region.
 *
 * ## Why this returns markup rather than data
 *
 * The panels are **theme slots**, and a theme's markup is the one thing the app
 * is not allowed to reimplement. An action returning JSON would mean the island
 * rendering rows in the browser — a second copy of two panels, in the app,
 * outside the theme contract, which the operator's theme could no longer
 * restyle. So the action renders the same server slots the page rendered and
 * returns the tree; React streams it as an RSC payload and the island swaps it
 * in. Nothing crosses as HTML and nothing is assigned to `innerHTML`.
 *
 * It is also what keeps the slots `server`. The alternative — marking them
 * `client` so they could re-render in the browser — would ship both panels and
 * everything they import to every reader of the index, which is the cost
 * `slots.ts` exists to argue against.
 *
 * ## Why it is not the page
 *
 * `router.refresh()` would have been three lines and no action at all, and it
 * re-runs **the whole index**: the community listing, the permission resolution,
 * the read state, presence, the totals, the announcements. A tab left open for
 * a working day would ask for the board's most expensive page several hundred
 * times to keep two panels current. This asks for the two panels.
 *
 * ## Authorization
 *
 * `renderLatestPanels` resolves the actor and builds the community scope itself,
 * exactly as the page does — an action is a public endpoint, and rendering the
 * page that mounted the island is not authorization for what the island then
 * calls. There is no argument to this function for the same reason: nothing a
 * caller sends can widen what it returns.
 */

import { renderLatestPanels } from './board-latest'

export async function refreshLatestPanels(): Promise<React.ReactNode> {
  return renderLatestPanels()
}
