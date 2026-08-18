import type { PanelKind } from '@meith/theme-kit'
import { requireSlot, slotCopy } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'

export interface PanelPageProps {
  readonly title: string
  readonly panel?: PanelKind
  readonly frame?: 'panel' | 'standalone'
  readonly back?: { readonly href: string; readonly label: string }
  readonly lede?: React.ReactNode
  readonly meta?: React.ReactNode
  readonly actions?: React.ReactNode
  readonly width?: 'reading' | 'wide'
  readonly gap?: 'normal' | 'loose'
  readonly children: React.ReactNode
}

export async function PanelPage({
  title,
  panel,
  frame = 'panel',
  back,
  lede,
  meta,
  actions,
  width = 'reading',
  gap = 'normal',
  children,
}: PanelPageProps) {
  const theme = await currentTheme()
  const Page = requireSlot(theme, 'PanelPage')

  const model = await filterView(
    'view.panel-page',
    {
      title,
      panel: panel ?? null,
      frame,
      back: back ?? null,
      width,
      gap,
      regions: {
        ...(lede === undefined ? {} : { lede }),
        ...(meta === undefined ? {} : { meta }),
        ...(actions === undefined ? {} : { actions }),
      },
    },
    viewerRef(await getActor()),
  )

  return (
    <Page {...model} copy={slotCopy(theme, 'PanelPage', await getTranslator())}>
      {children}
    </Page>
  )
}

export async function PanelSection({
  title,
  description,
  actions,
  id,
  children,
}: {
  readonly title: string
  readonly description?: React.ReactNode
  readonly actions?: React.ReactNode
  readonly id: string
  readonly children: React.ReactNode
}) {
  const theme = await currentTheme()
  const Section = requireSlot(theme, 'PanelSection')

  const model = await filterView(
    'view.panel-section',
    {
      title,
      headingId: id,
      regions: {
        ...(description === undefined ? {} : { description }),
        ...(actions === undefined ? {} : { actions }),
      },
    },
    viewerRef(await getActor()),
  )

  return (
    <Section {...model} copy={slotCopy(theme, 'PanelSection', await getTranslator())}>
      {children}
    </Section>
  )
}
