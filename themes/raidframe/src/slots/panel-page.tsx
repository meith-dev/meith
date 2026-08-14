import type { PanelKind, PanelPageModel, PanelSectionModel } from '@meith/theme-kit'

import { HEADING, MICRO, RULE } from '../shared'

const LABEL: Record<PanelKind, string> = {
  usercp: 'your control panel',
  modcp: 'moderator control panel',
  admincp: 'control panel',
}

export function PanelPage({
  panel,
  title,
  back,
  frame,
  width,
  gap,
  regions,
  children,
}: PanelPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`flex w-full flex-col p-4 ${
        frame === 'standalone' ? 'mx-auto flex-1' : ''
      } ${width === 'wide' ? 'max-w-none' : 'max-w-4xl'} ${
        gap === 'loose' ? 'gap-6' : 'gap-4'
      }`}
    >
      <div className="border border-border bg-card shadow-elevation">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            {back !== null && (
              <a href={back.href} className={`${MICRO} hover:text-primary`}>
                ← {back.label}
              </a>
            )}

            {panel !== null && back === null && <p className={MICRO}>{LABEL[panel]}</p>}

            <h1 className={`${HEADING} text-xl text-foreground`}>{title}</h1>

            {regions.lede !== undefined && (
              <p className="text-sm text-muted-foreground">{regions.lede}</p>
            )}
            {regions.meta !== undefined && <p className={`${MICRO} normal-case`}>{regions.meta}</p>}
          </div>

          {regions.actions !== undefined && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{regions.actions}</div>
          )}
        </div>
        <div className={RULE} aria-hidden="true" />
      </div>

      {children}
    </main>
  )
}

export function PanelSection({ title, headingId, regions, children }: PanelSectionModel) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border pb-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className={`${HEADING} text-base text-foreground`}>
            {title}
          </h2>
          {regions.description !== undefined && (
            <p className="text-sm text-muted-foreground">{regions.description}</p>
          )}
        </div>

        {regions.actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{regions.actions}</div>
        )}
      </div>

      {children}
    </section>
  )
}
