import { notFound } from 'next/navigation'

import { UserCpShell } from '@/components/account/usercp-shell'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'

/**
 * F57 — the UserCP's shell.
 *
 * It gates, and **every page under it gates again**. A layout is not a security
 * boundary in the App Router — it does not run before a Server Action, and a
 * route can be reached in ways that do not compose it — which is the rule F54's
 * ModCP already follows for the same reason. The double check costs one
 * `getActor()`, which is `React.cache`d.
 *
 * ## It renders the rail now, and the objection that stopped it is answered
 *
 * This file used to say: "There is no navigation rendered here. The panel's
 * index is the navigation, and a member reaches it from the user panel; a
 * second copy of those links in a sidebar would be a second list to keep in
 * step." The second list was the real objection and it no longer applies —
 * `@/view/usercp-nav` is the one tree, and both the rail and the index read
 * it, exactly as the ACP's two do.
 *
 * What the index-as-navigation argument missed is what it costs a member:
 * every screen in the panel was a dead end, so changing an avatar and then a
 * signature meant going back to the index in between. The ACP had the same
 * shape and the same problem.
 *
 * The shell is a component rather than this layout because three of the
 * panel's sections live in other route trees and render it too. See
 * `UserCpShell`.
 */
export default async function UserCpLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  const { memberSettings } = getContainer()

  /*
   * A guest and a board with no settings store get the same answer: not here.
   * Not a redirect to the login screen — a member's own control panel is
   * theirs, and its existence is not something to confirm to somebody who
   * cannot use it.
   */
  if (actor.userId === null || memberSettings === null) notFound()

  return <UserCpShell>{children}</UserCpShell>
}
