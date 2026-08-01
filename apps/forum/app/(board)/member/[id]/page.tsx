import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { visibleProfileFields } from '@/server/profile-fields'
import { activeTheme } from '@/server/theme'
import { buildMemberProfileView } from '@/view/member-profile'

export const metadata: Metadata = { title: 'Member profile' }

function memberId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const id = memberId((await params).id)
  if (id === null) notFound()

  const actor = await getActor()
  const { authorizer, memberProfiles, messages, warnings } = getContainer()
  if (!authorizer.can(actor, 'profile.view')) notFound()

  const profile = await memberProfiles.findPublicById(id)
  if (!profile) notFound()

  /* F57. The *viewer's* zone: "joined 3 Feb" should read in their local time. */
  const preferences = await getViewerPreferences()
  /*
   * F59, resolved for the *viewer* against the *owner's* answers. Already
   * filtered to what this viewer may see and to fields that have an answer, so
   * an invisible field is absent from the HTML rather than hidden with CSS
   * (F33's rule).
   */
  const customFields = await visibleProfileFields(id)

  const MemberProfile = requireSlot(activeTheme, 'MemberProfile')
  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <MemberProfile
        {...buildMemberProfileView(
          profile,
          new Date(),
          {
            /*
             * F53. Gated on the store as well as the permission — fixture mode
             * has no warnings, and a link to a page that 404s is worse than
             * none. Never offered on your own profile.
             */
            canWarn:
              warnings !== null &&
              actor.userId !== id &&
              authorizer.can(actor, 'user.warn'),
            /*
             * F60. Gated on the store as well as the permission, like `canWarn`
             * above, and never offered on your own profile — the service
             * refuses a message to yourself, so a link to one would only ever
             * lead to a refusal.
             */
            canMessage:
              messages !== null &&
              actor.userId !== null &&
              actor.userId !== id &&
              authorizer.can(actor, 'pm.use'),
            /* F57: the *viewer's* zone, so "joined" reads in their local time. */
            timeZone: preferences.timezone,
            /* F59's operator-defined fields, after F57's three fixed ones. */
            customFields,
          },
        )}
      />
    </main>
  )
}
