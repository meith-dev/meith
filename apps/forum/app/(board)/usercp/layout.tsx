import { notFound } from 'next/navigation'

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
 * There is no navigation rendered here. The panel's index is the navigation,
 * and a member reaches it from the user panel; a second copy of those links in
 * a sidebar would be a second list to keep in step with `userCpSections()`.
 */
export default async function UserCpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const actor = await getActor()
  const { memberSettings } = getContainer()

  /*
   * A guest and a board with no settings store get the same answer: not here.
   * Not a redirect to the login screen — a member's own control panel is
   * theirs, and its existence is not something to confirm to somebody who
   * cannot use it.
   */
  if (actor.userId === null || memberSettings === null) notFound()

  return children
}
