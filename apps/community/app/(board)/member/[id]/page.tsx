import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { RemoveRelationForm, SetRelationForm } from '@/components/account/relation-forms'
import { AvatarLockForm, SignatureLockForm } from '@/components/moderation/signature-lock-form'
import { BOARD_MEASURE } from '@/components/shell/measure'
import { avatarFor, avatarsFor } from '@/server/avatars'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { identitiesFor } from '@/server/group-identity'
import { filterView, pluginRegion, viewerRef } from '@/server/plugin-view'
import { visibleProfileFields } from '@/server/profile-fields'
import { relationService } from '@/server/relations'
import { reputationService, reputationSettings } from '@/server/reputation'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildMemberProfileView } from '@/view/member-profile'
import { reputationLabel } from '@/view/reputation'
import { numericId } from '@/view/slug-id'

export const metadata: Metadata = { title: 'Member profile' }

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const id = numericId((await params).id)
  if (id === null) notFound()

  const actor = await getActor()
  const { authorizer, memberProfiles, messages, warnings } = getContainer()
  if (!authorizer.can(actor, 'profile.view')) notFound()

  const profile = await memberProfiles.findPublicById(id)
  if (!profile) notFound()

  const preferences = await getViewerPreferences()
  const customFields = await visibleProfileFields(id)

  const relations = relationService()
  const currentRelation =
    relations === null || actor.userId === null || actor.userId === id
      ? null
      : (await relations.list(actor.userId, 'buddy')).some((row) => row.userId === id)
        ? 'buddy'
        : (await relations.ignores(actor.userId, id))
          ? 'ignore'
          : 'none'

  const reputation = reputationService()
  const repSettings = await reputationSettings()
  const repSummary =
    reputation === null || !repSettings.enabled ? null : await reputation.summary(id)

  const signatures = getContainer().signatures
  const signatureState =
    signatures === null || !authorizer.can(actor, 'user.warn')
      ? null
      : await signatures.read(id).catch(() => null)

  const MemberProfile = requireSlot(await currentTheme(), 'MemberProfile')

  const profileModel = await filterView(
    'view.member-profile',
    {
      ...buildMemberProfileView(profile, new Date(), {
        avatarUrl: (await avatarsFor([id])).get(id) ?? null,
        nameClass: (await identitiesFor([id])).get(id)?.nameClass ?? null,
        canWarn: warnings !== null && actor.userId !== id && authorizer.can(actor, 'user.warn'),
        canMessage:
          messages !== null &&
          actor.userId !== null &&
          actor.userId !== id &&
          authorizer.can(actor, 'pm.use'),
        timeZone: preferences.timezone,
        customFields,
      }),
      regions: {
        plugins: await pluginRegion('profile.panel', {
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
                    label={currentRelation === 'buddy' ? 'Remove from buddy list' : 'Stop ignoring'}
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

            {signatureState !== null && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-muted-foreground">
                  Signature: {signatureState.locked ? 'locked' : 'allowed'}
                </span>
                <SignatureLockForm userId={id} locked={signatureState.locked} />
                <AvatarLockForm userId={id} locked={(await avatarFor(id)).locked} />
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
