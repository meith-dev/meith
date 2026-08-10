import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { PanelPage } from '@/components/shell/panel-page'
import { OptionsForm } from '@/components/account/usercp-forms'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { getSettings } from '@/server/settings'
import { currentTheme } from '@/server/theme'
import { availableTimezones, optionsFormValues, userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your options' }

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
  const Notice = requireSlot(await currentTheme(), 'Notice')

  return (
    <PanelPage
      title="Your options"
      lede="Your timezone, and how much of a thread fits on a page."
    >
      {notice !== null && (
        <Notice
          kind={notice.kind}
          message={notice.message}
          dismissHref="/usercp/options"
        />
      )}

      <OptionsForm
        {...values}
        timezones={availableTimezones()}
        boardPostsPerPage={board.get('display.posts_per_page')}
        boardThreadsPerPage={board.get('display.threads_per_page')}
      />
    </PanelPage>
  )
}
