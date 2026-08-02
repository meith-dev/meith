import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { OptionsForm } from '@/components/account/usercp-forms'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { getSettings } from '@/server/settings'
import { activeTheme } from '@/server/theme'
import { availableTimezones, optionsFormValues, userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your options' }

/**
 * F57 — the two settings that change how the board renders.
 *
 * Both were constants until this feature: `view/time.ts` formatted everything
 * in UTC and the footer said so, and `view/paging.ts` held two numbers. The
 * screen is only half of the work — the other half is that the values are
 * actually read on every page (`viewer-preferences.ts`), which is what makes
 * this a setting rather than a stored number.
 */
export default async function OptionsPage({
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

  const board = await getSettings()
  const values = optionsFormValues(settings)
  const notice = userCpNotice(query)
  const Notice = requireSlot(activeTheme, 'Notice')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/options" />
        )}

        <div>
          <h1 className="font-serif text-2xl font-semibold">Your options</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <a href="/usercp" className="text-primary hover:underline">
              Back to your control panel
            </a>
          </p>
        </div>

        <OptionsForm
          {...values}
          timezones={availableTimezones()}
          boardPostsPerPage={board.get('display.posts_per_page')}
          boardThreadsPerPage={board.get('display.threads_per_page')}
        />
      </div>
    </main>
  )
}
