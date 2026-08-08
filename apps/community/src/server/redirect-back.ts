import 'server-only'

/**
 * Send a Server Action's caller back to the page they were on.
 *
 * ## Why an action that changes the `<html>` element has to do this
 *
 * A Server Action re-renders the route it was posted from, but the client
 * Router Cache holds the **layout** — so an action that changes something the
 * *root layout* renders appears to do nothing until the next full navigation.
 * That is exactly what the appearance controls change: `data-theme`
 * and the colour-scheme class live on `<html>`.
 *
 * It is a real bug and an invisible one. With scripting off, the browser's own
 * 303 back to the same URL re-fetches everything and the change lands; with
 * scripting on, the same button did nothing at all until you reloaded. The
 * version of this feature that shipped without this helper passed every unit
 * test — the cookie *was* being written — and failed the first time it was
 * driven in a browser.
 *
 * ## Why a redirect rather than `revalidatePath`
 *
 * `revalidatePath('/', 'layout')` would also work and is the obvious reach. It
 * is the wrong tool here: it purges cached data for every route under `/`, so a
 * member toggling dark mode would drop the board's cached settings and forum
 * tree *for everybody*. A redirect costs one round trip and invalidates
 * nothing.
 *
 * ## Where the path comes from
 *
 * The proxy already sets it (F75's `PATH_HEADER`) — a Server Component cannot
 * ask for its own URL, and neither can an action. The header carries the path
 * and no query string, which is what this needs and is deliberately all the
 * proxy is willing to copy.
 *
 * When the header is absent the caller is left alone rather than sent somewhere
 * invented: the no-JavaScript path does not need this at all, and guessing `/`
 * would move a reader off the thread they were reading in order to change a
 * colour.
 */
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { PATH_HEADER } from './location-header'

export async function redirectToCurrentPath(): Promise<void> {
  const path = (await headers()).get(PATH_HEADER)

  /*
   * Must be a path on this board, not a URL. The header is set by our own
   * proxy, but "it came from us" is the argument behind every open redirect
   * that ever shipped, and the check is one line.
   */
  if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) {
    redirect(path)
  }
}
