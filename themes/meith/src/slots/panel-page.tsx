import type { PanelPageModel, PanelSectionModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  EDITORIAL_RULE,
  ITEM_RULE,
  LABEL,
  LEDE,
  META,
  PAGE_TITLE,
  PANEL_TITLE,
  QUIET_LINK,
  SHELL,
} from '../shared'

export function PanelPage({
  title,
  back,
  frame,
  width,
  gap,
  regions,
  children,
  copy,
}: PanelPageModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.panelPage.${key}`)

  const frameClass = frame === 'standalone' ? `${SHELL} flex-1 py-8` : 'w-full'
  const widthClass = width === 'wide' ? 'max-w-none' : 'max-w-4xl'

  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`flex flex-col ${frameClass} ${widthClass} ${gap === 'loose' ? 'gap-10' : 'gap-8'}`}
    >
      <div
        className={`${EDITORIAL_RULE} flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8`}
      >
        <div className="flex min-w-0 flex-col gap-2">
          {back !== null && (
            <a
              href={back.href}
              className={`${LABEL} inline-flex w-fit items-center gap-2 ${QUIET_LINK}`}
            >
              <span aria-hidden="true">{c('back')}</span> {back.label}
            </a>
          )}

          <h1 className={PAGE_TITLE}>{title}</h1>

          {regions.lede !== undefined && <p className={LEDE}>{regions.lede}</p>}
          {regions.meta !== undefined && <p className={META}>{regions.meta}</p>}
        </div>

        {regions.actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">{regions.actions}</div>
        )}
      </div>

      {children}
    </main>
  )
}

export function PanelSection({ title, headingId, regions, children }: PanelSectionModel) {
  return (
    <section aria-labelledby={headingId} className={`${ITEM_RULE} flex flex-col gap-4 pt-4`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className={PANEL_TITLE}>
            {title}
          </h2>
          {regions.description !== undefined && <p className={META}>{regions.description}</p>}
        </div>

        {regions.actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">{regions.actions}</div>
        )}
      </div>

      {children}
    </section>
  )
}
