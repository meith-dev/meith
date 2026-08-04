import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { ProfileForm } from '@/components/account/usercp-forms'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { profileFieldService, viewerFieldContext } from '@/server/profile-fields'
import { activeTheme } from '@/server/theme'
import { customFieldInputs, profileFormValues, userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your profile' }

/**
 * F57 — the three fields a member writes about themselves.
 *
 * They are public by definition: this is the *public* profile, and a member who
 * fills them in is publishing them. They render as plain text on `/member/[id]`
 * — a signature is F58's BBCode and a genuinely different thing, because that
 * one is markup, group-limited and moderated.
 */
export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const settings = await memberSettings.read(actor.userId)
  if (settings === null) notFound()

  const values = profileFormValues(settings)

  /*
   * F59's fields, filtered to the ones this member may edit — which is not the
   * same set as the ones they may *see*: a board can collect something only
   * staff read, and a member who cannot see their own answer can still be asked
   * for it.
   */
  const fields = profileFieldService()
  const context = await viewerFieldContext()
  const customFields =
    fields === null || context === null
      ? []
      : customFieldInputs(await fields.editableFor(actor.userId, context))
  const notice = userCpNotice(query)
  const Notice = requireSlot(activeTheme, 'Notice')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/profile" />
        )}

        <div>
          <h1 className="font-serif text-2xl font-semibold">Your profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown on{' '}
            <a href={`/member/${settings.userId}`} className="text-primary hover:underline">
              your public profile
            </a>
            .{' '}
            <a href="/usercp" className="text-primary hover:underline">
              Back to your control panel
            </a>
          </p>
        </div>

        <ProfileForm {...values} customFields={customFields} />
      </div>
    </main>
  )
}
