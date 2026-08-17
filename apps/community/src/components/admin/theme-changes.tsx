'use client'

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

const LINK =
  'text-xs font-medium underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function StateBadge({ change }: { change: TokenChange }) {
  const [label, tone] =
    change.state === 'saved'
      ? (['Live', 'border-border text-muted-foreground'] as const)
      : change.state === 'cleared'
        ? (['Unsaved — back to the theme’s', 'border-primary text-primary'] as const)
        : (['Unsaved', 'border-primary text-primary'] as const)

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

function schemeLabel(scheme: TokenChange['scheme']): string {
  return scheme === 'both' ? 'Both schemes' : scheme === 'dark' ? 'Dark' : 'Light'
}

export function ChangeSummary({
  changes,
  customCssChanged,
  hydrated,
  onUndo,
  onClear,
  onDiscardAll,
}: {
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
        <h3 className="text-base font-semibold tracking-tight">What you are changing</h3>
        {hydrated && unsaved > 0 && (
          <button type="button" onClick={onDiscardAll} className={LINK}>
            Discard unsaved changes
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {counts.overridden === 0 && !customCssChanged ? (
          <>
            Nothing is overridden: this theme is exactly as it ships. Every value below is the
            theme’s own.
          </>
        ) : (
          <>
            <strong className="font-medium text-foreground">
              {counts.overridden} value{counts.overridden === 1 ? '' : 's'}
            </strong>{' '}
            overridden across {counts.tokens} token{counts.tokens === 1 ? '' : 's'}
            {customCssChanged || counts.unsaved > 0 ? (
              <>
                , of which{' '}
                <strong className="font-medium text-foreground">
                  {unsaved} {unsaved === 1 ? 'is' : 'are'} not saved yet
                </strong>{' '}
                — the board is still painting the left-hand value.
              </>
            ) : (
              <> — all of them saved, and live on the board now.</>
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
                    {schemeLabel(change.scheme)}
                  </span>
                </span>
                <StateBadge change={change} />
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
                        ? 'Undo — leave it as the theme has it'
                        : 'Undo — back to the saved value'}
                    </button>
                  )}
                  {change.draft !== '' && (
                    <button type="button" onClick={() => onClear(change)} className={LINK}>
                      Use the theme’s value
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
          <span className="font-medium">Custom CSS</span> has unsaved edits. It is not painted in
          the live sample above — press “Preview without saving” to see it applied.
        </p>
      )}
    </section>
  )
}

function ratioLine(check: ContrastCheck): string {
  return check.ratio === null
    ? 'not measurable'
    : `${formatRatio(check.ratio)} — needs ${check.required}:1`
}

function Failure({
  check,
  inherited,
  copy,
}: {
  check: ContrastCheck
  inherited: boolean
  copy: Readonly<Record<string, string>>
}) {
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-medium">{copy[check.pair.labelKey]}</span>
        <span className="font-mono text-[0.6875rem] tabular-nums">{ratioLine(check)}</span>
      </span>
      <span className="font-mono text-[0.6875rem] text-muted-foreground">
        <a href={`#token-${check.pair.foreground}`} className="underline underline-offset-2">
          {check.pair.foreground}
        </a>{' '}
        on{' '}
        <a href={`#token-${check.pair.background}`} className="underline underline-offset-2">
          {check.pair.background}
        </a>
        {inherited && ' · already like this on the board'}
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
  copy: Readonly<Record<string, string>>
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
          {passing.length} of {draftChecks.length} pass AA
          {unknown.length > 0 && `, ${unknown.length} not measurable`}
        </span>
      </p>

      {failing.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Every pair the board paints clears its WCAG AA threshold.
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
          Every pair measured, in {label.toLowerCase()}
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {draftChecks.map((check) => (
            <li
              key={`${check.pair.foreground}/${check.pair.background}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3"
            >
              <span className="text-muted-foreground">{copy[check.pair.labelKey]}</span>
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
  copy: Readonly<Record<string, string>>
}) {
  const reports = SCHEMES.map((scheme: Scheme) => ({
    scheme,
    draftChecks: checkContrast(effectiveValues(tokens, draft, scheme)),
    savedChecks: checkContrast(savedValues(tokens, scheme)),
  }))

  return (
    <section className="flex flex-col gap-3" id="legibility">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">Can it be read?</h3>
        <p className="text-xs text-muted-foreground">
          Every pair of colours the board actually puts on top of each other, measured against WCAG
          AA — 4.5:1 for text, 3:1 for a focus ring or a field’s edge. Measured from the form, so it
          moves as you do. A value this screen cannot read as a colour — <code>color-mix()</code>, a{' '}
          <code>var()</code>, an alpha channel — is reported as not measurable rather than as a
          pass.
        </p>
      </div>

      {reports.map((report) => (
        <SchemeReport
          key={report.scheme}
          label={report.scheme === 'dark' ? 'Dark' : 'Light'}
          draftChecks={report.draftChecks}
          savedChecks={report.savedChecks}
          copy={copy}
        />
      ))}
    </section>
  )
}
