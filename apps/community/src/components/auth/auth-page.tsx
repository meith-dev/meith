import type { AuthLinkModel } from '@meith/theme-kit'
import { requireSlot, slotCopy } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'

export interface AuthPageProps {
  readonly title: string
  readonly lede?: React.ReactNode
  readonly note?: React.ReactNode
  readonly alert?: string | null
  readonly links?: readonly AuthLinkModel[]
  readonly children?: React.ReactNode
}

export async function AuthPage({
  title,
  lede,
  note,
  alert = null,
  links = [],
  children,
}: AuthPageProps) {
  const theme = await currentTheme()
  const Page = requireSlot(theme, 'AuthPage')

  const model = await filterView(
    'view.auth-page',
    {
      title,
      alert,
      links,
      regions: {
        ...(lede === undefined ? {} : { lede }),
        ...(note === undefined ? {} : { note }),
        ...(children === undefined ? {} : { form: children }),
      },
    },
    viewerRef(await getActor()),
  )

  return <Page {...model} copy={slotCopy(theme, 'AuthPage', await getTranslator())} />
}
