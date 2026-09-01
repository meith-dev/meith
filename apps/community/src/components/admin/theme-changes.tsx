'use client'

import { textLinkVariants } from '@meith/ui'

import { type ContrastCheck, checkContrast, contrastGrade, formatRatio } from '@/view/contrast'
import {
  changeCounts,
  type Draft,
  type EditableToken,
  effectiveValues,
  SCHEMES,
  type Scheme,
  savedValues,
  type TokenChange,
} from '@/view/theme-draft'

import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'

const LINK = `${textLinkVariants({ tone: 'inherit', size: 'xs' })} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`

function StateBadge({ change, copy }: { change: TokenChange; copy: Copy }) {
  const [label, tone] =
    change.state === 'saved'
      ? ([
          fromCopy(copy, 'adminTheme.changes.live'),
          'border-border text-muted-foreground',
        ] as const)
      : change.state === 'cleared'
        ? ([
            fromCopy(copy, 'adminTheme.changes.unsavedCleared'),
            'border-primary text-primary',
          ] as const)
        : ([fromCopy(copy, 'adminTheme.token.unsaved'), 'border-primary text-primary'] as const)

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${tone}`}>
      {label}
    </span>
  )
}

function Value({ value, colour }: { value: string; colour: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {colour && (
        <span
          aria-hidden
          className="size-4 shrink-0 rounded-sm border border-border"
          style={{ background: value }}
        />
      )}
      <span className="truncate font-mono text-xs">{value}</span>
    </span>
  )
}

function schemeLabel(copy: Copy, scheme: TokenChange['scheme']): string {
  return scheme === 'both'
    ? fromCopy(copy, 'adminTheme.scheme.both')
    : scheme === 'dark'
      ? fromCopy(copy, 'adminTheme.scheme.dark')
      : fromCopy(copy, 'adminTheme.scheme.light')
}

export function ChangeSummary({
  copy,
  changes,
  customCssChanged,
  hydrated,
  onUndo,
  onClear,
  onDiscardAll,
}: {
  copy: Copy
  changes: readonly TokenChange[]
  customCssChanged: boolean
  hydrated: boolean
  onUndo: (change: TokenChange) => void
  onClear: (change: TokenChange) => void
  onDiscardAll: () => void
}) {
  const counts = changeCounts(changes)
  const unsaved = counts.unsaved + (customCssChanged ? 1 : 0)

  return (
    <section className="flex flex-col gap-3" id="changes">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">
          {fromCopy(copy, 'adminTheme.changes.title')}
        </h3>
        {hydrated && unsaved > 0 && (
          <button type="button" onClick={onDiscardAll} className={LINK}>
            {fromCopy(copy, 'adminTheme.changes.discardAll')}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {counts.overridden === 0 && !customCssChanged ? (
          fromCopy(copy, 'adminTheme.changes.nothingOverridden')
        ) : (
          <>
            <strong className="font-medium text-foreground">
              {formatFromCopy(copy, 'adminTheme.changes.valueCount', { count: counts.overridden })}
            </strong>{' '}
            {formatFromCopy(copy, 'adminTheme.changes.overriddenAcross', { count: counts.tokens })}
            {customCssChanged || counts.unsaved > 0 ? (
              <>
                {fromCopy(copy, 'adminTheme.changes.ofWhich')}{' '}
                <strong className="font-medium text-foreground">
                  {formatFromCopy(copy, 'adminTheme.changes.notSavedYet', { count: unsaved })}
                </strong>{' '}
                {fromCopy(copy, 'adminTheme.changes.stillPainting')}
              </>
            ) : (
              <> {fromCopy(copy, 'adminTheme.changes.allSaved')}</>
            )}
          </>
        )}
      </p>

      {changes.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {changes.map((change) => (
            <li
              key={`${change.token.name}.${change.scheme}`}
              className="flex flex-col gap-1.5 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex flex-wrap items-baseline gap-2">
                  <a href={`#token-${change.token.name}`} className={LINK}>
                    {change.token.label}
                  </a>
                  <span className="font-mono text-[0.6875rem] text-muted-foreground">
                    {change.token.name}
                  </span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {schemeLabel(copy, change.scheme)}
                  </span>
                </span>
                <StateBadge change={change} copy={copy} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                {change.state === 'saved' ? (
                  <span className="text-foreground">
                    <Value value={change.next} colour={change.token.kind === 'colour'} />
                  </span>
                ) : (
                  <>
                    <Value value={change.current} colour={change.token.kind === 'colour'} />
                    <span aria-hidden>→</span>
                    <span className="text-foreground">
                      <Value value={change.next} colour={change.token.kind === 'colour'} />
                    </span>
                  </>
                )}
              </div>

              {hydrated && (
                <div className="flex flex-wrap gap-3">
                  {change.state !== 'saved' && (
                    <button type="button" onClick={() => onUndo(change)} className={LINK}>
                      {change.saved === ''
                        ? fromCopy(copy, 'adminTheme.changes.undoToTheme')
                        : fromCopy(copy, 'adminTheme.changes.undoToSaved')}
                    </button>
                  )}
                  {change.draft !== '' && (
                    <button type="button" onClick={() => onClear(change)} className={LINK}>
                      {fromCopy(copy, 'adminTheme.useThemesValue')}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {customCssChanged && (
        <p className="rounded-md border border-primary px-3 py-2 text-xs">
          {copy['adminTheme.changes.cssUnsavedLead']}
          <span className="font-medium">{fromCopy(copy, 'adminTheme.css.label')}</span>
          {copy['adminTheme.changes.cssUnsavedTail']}
        </p>
      )}
    </section>
  )
}

function ratioLine(copy: Copy, check: ContrastCheck): string {
  return check.ratio === null
    ? fromCopy(copy, 'adminTheme.legibility.notMeasurable')
    : formatFromCopy(copy, 'adminTheme.legibility.ratioNeeds', {
        ratio: formatRatio(check.ratio),
        required: check.required,
      })
}

function Failure({
  check,
  inherited,
  copy,
}: {
  check: ContrastCheck
  inherited: boolean
  copy: Copy
}) {
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-medium">{fromCopy(copy, check.pair.labelKey)}</span>
        <span className="font-mono text-[0.6875rem] tabular-nums">{ratioLine(copy, check)}</span>
      </span>
      <span className="font-mono text-[0.6875rem] text-muted-foreground">
        <a href={`#token-${check.pair.foreground}`} className="underline underline-offset-2">
          {check.pair.foreground}
        </a>{' '}
        {fromCopy(copy, 'adminTheme.legibility.on')}{' '}
        <a href={`#token-${check.pair.background}`} className="underline underline-offset-2">
          {check.pair.background}
        </a>
        {inherited && ` ${fromCopy(copy, 'adminTheme.legibility.alreadyLike')}`}
      </span>
    </li>
  )
}

function SchemeReport({
  label,
  draftChecks,
  savedChecks,
  copy,
}: {
  label: string
  draftChecks: readonly ContrastCheck[]
  savedChecks: readonly ContrastCheck[]
  copy: Copy
}) {
  const failing = draftChecks.filter((check) => check.state === 'fail')
  const unknown = draftChecks.filter((check) => check.state === 'unknown')
  const passing = draftChecks.filter((check) => check.state === 'pass')

  const wasFailing = new Set(
    savedChecks
      .filter((check) => check.state === 'fail')
      .map((check) => `${check.pair.foreground}/${check.pair.background}`),
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatFromCopy(copy, 'adminTheme.legibility.passCount', {
            passing: passing.length,
            total: draftChecks.length,
          })}
          {unknown.length > 0 &&
            formatFromCopy(copy, 'adminTheme.legibility.unknownCount', {
              count: unknown.length,
            })}
        </span>
      </p>

      {failing.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminTheme.legibility.allPass')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-destructive">
          {failing.map((check) => (
            <Failure
              key={`${check.pair.foreground}/${check.pair.background}`}
              check={check}
              inherited={wasFailing.has(`${check.pair.foreground}/${check.pair.background}`)}
              copy={copy}
            />
          ))}
        </ul>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          {formatFromCopy(copy, 'adminTheme.legibility.everyPairIn', {
            scheme: label.toLowerCase(),
          })}
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {draftChecks.map((check) => (
            <li
              key={`${check.pair.foreground}/${check.pair.background}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3"
            >
              <span className="text-muted-foreground">{fromCopy(copy, check.pair.labelKey)}</span>
              <span className="font-mono tabular-nums">
                {check.ratio === null
                  ? '—'
                  : `${formatRatio(check.ratio)} ${contrastGrade(check.ratio, check.pair.need)}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export function LegibilityReport({
  tokens,
  draft,
  copy,
}: {
  tokens: readonly EditableToken[]
  draft: Draft
  copy: Copy
}) {
  const reports = SCHEMES.map((scheme: Scheme) => ({
    scheme,
    draftChecks: checkContrast(effectiveValues(tokens, draft, scheme)),
    savedChecks: checkContrast(savedValues(tokens, scheme)),
  }))

  return (
    <section className="flex flex-col gap-3" id="legibility">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">
          {fromCopy(copy, 'adminTheme.legibility.title')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {copy['adminTheme.legibility.blurbLead']}
          <code>color-mix()</code>
          {copy['adminTheme.legibility.blurbMid']}
          <code>var()</code>
          {copy['adminTheme.legibility.blurbTail']}
        </p>
      </div>

      {reports.map((report) => (
        <SchemeReport
          key={report.scheme}
          label={
            report.scheme === 'dark'
              ? fromCopy(copy, 'adminTheme.scheme.dark')
              : fromCopy(copy, 'adminTheme.scheme.light')
          }
          draftChecks={report.draftChecks}
          savedChecks={report.savedChecks}
          copy={copy}
        />
      ))}
    </section>
  )
}
