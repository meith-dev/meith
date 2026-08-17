import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { OptionsForm } from '@/components/account/usercp-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { catalogs, getTranslator, tr } from '@/server/i18n'
import { getSettings } from '@/server/settings'
import { currentTheme } from '@/server/theme'
import { optionsFormCopy } from '@/view/account-copy'
import { localeChoices, optionsFormValues, timezoneChoices, userCpNotice } from '@/view/usercp'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.options') }
}

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
  const notice = userCpNotice(query, await getTranslator())
  const Notice = requireSlot(await currentTheme(), 'Notice')

  return (
    <PanelPage
      title={await tr('page.options')}
      lede={await tr('page.language-timezone-how-much-thread')}
    >
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/options" />
      )}

      <OptionsForm
        {...values}
        timezones={timezoneChoices(await getTranslator())}
        locales={localeChoices(catalogs.locales, await getTranslator())}
        copy={optionsFormCopy(
          board.get('display.posts_per_page'),
          board.get('display.threads_per_page'),
          await getTranslator(),
        )}
      />
    </PanelPage>
  )
}
