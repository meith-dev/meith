import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { filterView, pluginRegion, viewerRef } from '@/server/plugin-view'

import { BOARD_MEASURE } from '@/components/shell/measure'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { visibleProfileFields } from '@/server/profile-fields'
import { relationService } from '@/server/relations'
import { reputationService, reputationSettings } from '@/server/reputation'
import { reputationLabel } from '@/view/reputation'
import {
  AvatarLockForm,
  SignatureLockForm,
} from '@/components/moderation/signature-lock-form'
import {
  RemoveRelationForm,
  SetRelationForm,
} from '@/components/account/relation-forms'
import { currentTheme } from '@/server/theme'
import { avatarFor, avatarsFor } from '@/server/avatars'
import { buildMemberProfileView } from '@/view/member-profile'
import { identitiesFor } from '@/server/group-identity'

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

  /*
   * F61's two buttons. Offered only to a signed-in member looking at somebody
   * else, on a board that keeps lists — and the *current* relation decides
   * which of the three controls appears, so somebody already ignored is offered
   * "stop ignoring" rather than a second "ignore".
   */
  const relations = relationService()
  const currentRelation =
    relations === null || actor.userId === null || actor.userId === id
      ? null
      : ((await relations.list(actor.userId, 'buddy')).some((row) => row.userId === id)
          ? 'buddy'
          : (await relations.ignores(actor.userId, id))
            ? 'ignore'
            : 'none')

  /*
   * F62. The summary only — the history and the rating form live on their own
   * route, because a history pages and a profile that grew a pager for one
   * section would have to page the rest of itself too. Absent entirely when
   * reputation is switched off, rather than shown as a permanent zero.
   */
  const reputation = reputationService()
  const repSettings = await reputationSettings()
  const repSummary =
    reputation === null || !repSettings.enabled ? null : await reputation.summary(id)

  /*
   * F58's moderator control. Offered only to somebody who may warn — the same
   * trust level, aimed at the same thing (a person rather than a community's
   * content) — and only on a board that keeps signatures at all.
   */
  const signatures = getContainer().signatures
  const signatureState =
    signatures === null || !authorizer.can(actor, 'user.warn')
      ? null
      : await signatures.read(id).catch(() => null)

  const MemberProfile = requireSlot(await currentTheme(), 'MemberProfile')

  /*
   * F80. The profile is one filter and one region — the natural home for a
   * plugin that adds a panel of its own data about a member.
   */
  const profileModel = await filterView(
    'view.member-profile',
    {
      ...buildMemberProfileView(
          profile,
          new Date(),
          {
            /* F58. Null for a member who set none, and for a locked one. */
            avatarUrl: (await avatarsFor([id])).get(id) ?? null,
            /* Their group's colour, so the name reads the same here as it does
               on every post they have written. */
            nameClass: (await identitiesFor([id])).get(id)?.nameClass ?? null,
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
      ),
      regions: {
        plugins: pluginRegion('profile.panel', {
          viewer: viewerRef(actor),
          subjectId: id,
          authorId: id,
        }),
      },
    },
    viewerRef(actor),
  )

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <MemberProfile {...profileModel} />

      {/*
       * Everything the *route* renders about this member, in one panel under
       * the profile.
       *
       * It was three loose strips, each centred in its own `max-w-3xl` while
       * the profile above them sat in the theme's much wider measure — so on a
       * desktop the reputation line began two hundred pixels to the right of
       * the card it belonged to, aligned with nothing on the page. They are
       * one card on the board's measure now, which is what `BOARD_MEASURE`
       * exists to say (see its header).
       *
       * Still three separate rows inside it, because they are three unrelated
       * things: what staff may lock, what the member is rated, and what you
       * want to do about them.
       */}
      {(signatureState !== null || repSummary !== null || currentRelation !== null) && (
        <div className={`${BOARD_MEASURE} pt-4 pb-8`}>
          <section
            aria-label={`About ${profile.username}`}
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card text-sm"
          >
            {repSummary !== null && (
              <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                <span className="text-muted-foreground">Reputation</span>
                <span className="font-medium">{reputationLabel(repSummary)}</span>
                <a
                  href={`/member/${id}/reputation`}
                  className="ms-auto font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  See all ratings
                </a>
              </div>
            )}

            {currentRelation !== null && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                {currentRelation === 'none' ? (
                  <>
                    <SetRelationForm
                      userId={id}
                      username={profile.username}
                      kind="buddy"
                      returnTo={`/member/${id}`}
                      label="Add to buddy list"
                    />
                    <SetRelationForm
                      userId={id}
                      username={profile.username}
                      kind="ignore"
                      returnTo={`/member/${id}`}
                      label="Ignore this member"
                    />
                  </>
                ) : (
                  <RemoveRelationForm
                    userId={id}
                    username={profile.username}
                    returnTo={`/member/${id}`}
                    label={
                      currentRelation === 'buddy' ? 'Remove from buddy list' : 'Stop ignoring'
                    }
                  />
                )}
                <a
                  href="/usercp/contacts"
                  className="ms-auto text-sm text-muted-foreground hover:text-foreground"
                >
                  Your lists
                </a>
              </div>
            )}

            {/* Staff only, and last: it is about this member, not for them. */}
            {signatureState !== null && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-muted-foreground">
                  Signature: {signatureState.locked ? 'locked' : 'allowed'}
                </span>
                <SignatureLockForm userId={id} locked={signatureState.locked} />
                {/* F58's other half. Offered on the same terms and in the same place. */}
                <AvatarLockForm userId={id} locked={(await avatarFor(id)).locked} />
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
