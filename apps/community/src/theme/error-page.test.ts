import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { sourceTranslator } from '@meith/i18n'
import { requireSlot, resolveTheme, slotCopy, type ThemeDefinition } from '@meith/theme-kit'

import { CrashNoticeProvider } from '@/components/shell/crash-notice'
import { buildErrorNotice, CRASH_NOTICE, crashNoticeCopy } from '@/view/error-notice'

import ErrorPage from '../../app/error'
import forumConfig from '../../community.config'

const REQUEST_ID = 'req-8f21'

const themes: readonly { key: string; definition: ThemeDefinition }[] = Object.values(
  forumConfig.themes,
)
  .filter((installed) => installed.theme !== undefined)
  .map((installed) => ({
    key: installed.key,
    definition: installed.theme as ThemeDefinition,
  }))

const t = sourceTranslator({})

async function themedNotice(definition: ThemeDefinition): Promise<ReactNode> {
  const resolved = resolveTheme(definition)
  const Slot = requireSlot(resolved, 'ErrorNotice') as (props: object) => ReactNode
  return Slot({
    ...buildErrorNotice(CRASH_NOTICE, REQUEST_ID),
    copy: slotCopy(resolved, 'ErrorNotice', t),
  })
}

function renderErrorPage(notice: ReactNode): string {
  return renderToStaticMarkup(
    createElement(CrashNoticeProvider, {
      notice,
      requestId: REQUEST_ID,
      copy: crashNoticeCopy(),
      // biome-ignore lint/correctness/noChildrenProp: CrashNoticeValue declares children, so the props form is the only one that typechecks
      children: createElement(ErrorPage),
    }),
  )
}

function markup(node: ReactNode): string {
  return renderToStaticMarkup(createElement(() => node as never))
}

describe('the crash page', () => {
  it('finds at least one registered theme', () => {
    expect(themes.length).toBeGreaterThan(0)
  })

  it.each(themes)('renders theme "$key" through its ErrorNotice slot', async ({ definition }) => {
    const notice = await themedNotice(definition)
    const html = renderErrorPage(notice)

    expect(html).toContain(markup(notice))
    expect(html).toContain(crashNoticeCopy().title)
    expect(html).toContain(REQUEST_ID)
    expect(html).toContain('id="board-content"')
  })

  it('falls back to a plain notice when the theme could not be resolved', () => {
    const html = renderErrorPage(null)

    expect(html).toContain(crashNoticeCopy().title)
    expect(html).toContain(crashNoticeCopy().message)
    expect(html).toContain(REQUEST_ID)
    expect(html).toContain('href="/"')
  })
})
