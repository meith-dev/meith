"use client"

/**
 * The two panels that answer "what am I actually changing?"
 *
 * ## The change list
 *
 * The editor shows every token a theme declares — forty-four of them, most of
 * them untouched on any real board — so the three an operator has changed are
 * three rows in a very long form. The old screen said "Overridden by this
 * board." under each one and left the counting to the reader; nothing on the
 * page could answer *what have I changed*, and nothing at all could answer *what
 * have I changed since I opened this screen*, which is the question somebody
 * asks with their finger over the Save button.
 *
 * So each change is listed once, with the value the board is painting **now**
 * beside the value a save would paint, and a badge saying which of the two the
 * board is currently serving. The two questions are genuinely different and a
 * screen that answers only one of them is how an operator saves a colour they
 * were only trying out.
 *
 * ## The legibility report
 *
 * Colour is the one design decision whose failure mode is invisible to the
 * person making it: an operator picks a colour they can read, on their screen,
 * with their eyes. `@/view/contrast` measures the pairs the board actually
 * paints, and this panel reports them per scheme.
 *
 * **It attributes.** A failure that was already on the board before this screen
 * was opened is marked as such, because "you broke this" and "this was already
 * broken" call for different actions from the same operator — and because a
 * panel that blames somebody for a palette they inherited is one they will learn
 * to close.
 */

import {
  checkContrast,
  contrastGrade,
  formatRatio,
  type ContrastCheck,
} from "@/view/contrast"
import {
  changeCounts,
  effectiveValues,
  savedValues,
  SCHEMES,
  type Draft,
  type EditableToken,
  type Scheme,
  type TokenChange,
} from "@/view/theme-draft"

const LINK =
  "text-xs font-medium underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** The state badge. Wording, not colour alone — the board's own rule. */
function StateBadge({ change }: { change: TokenChange }) {
  const [label, tone] =
    change.state === "saved"
      ? (["Live", "border-border text-muted-foreground"] as const)
      : change.state === "cleared"
        ? (["Unsaved — back to the theme’s", "border-primary text-primary"] as const)
        : (["Unsaved", "border-primary text-primary"] as const)

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${tone}`}>
      {label}
    </span>
  )
}

/**
 * One value, shown as what it is.
 *
 * A colour gets a swatch and its text; a corner radius or a font stack gets the
 * text alone, because a square painted with `0.5rem` is a square painted with
 * nothing and reads as a bug. The swatch is set through `style` rather than a
 * class, so a half-typed value is a property the browser drops.
 */
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

function schemeLabel(scheme: TokenChange["scheme"]): string {
  return scheme === "both" ? "Both schemes" : scheme === "dark" ? "Dark" : "Light"
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
  /** The CSS box is one field with no per-token story; it is reported flat. */
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
            Nothing is overridden: this theme is exactly as it ships. Every value below is
            the theme’s own.
          </>
        ) : (
          <>
            <strong className="font-medium text-foreground">
              {counts.overridden} value{counts.overridden === 1 ? "" : "s"}
            </strong>{" "}
            overridden across {counts.tokens} token{counts.tokens === 1 ? "" : "s"}
            {customCssChanged || counts.unsaved > 0 ? (
              <>
                , of which{" "}
                <strong className="font-medium text-foreground">
                  {unsaved} {unsaved === 1 ? "is" : "are"} not saved yet
                </strong>{" "}
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

              {/*
                One value when a save would not move it, two when it would. The
                same colour with an arrow between it and itself is a row that
                looks like a change and is not, which is exactly the confusion
                this panel exists to end.
              */}
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                {change.state === "saved" ? (
                  <span className="text-foreground">
                    <Value value={change.next} colour={change.token.kind === "colour"} />
                  </span>
                ) : (
                  <>
                    <Value value={change.current} colour={change.token.kind === "colour"} />
                    <span aria-hidden>→</span>
                    <span className="text-foreground">
                      <Value value={change.next} colour={change.token.kind === "colour"} />
                    </span>
                  </>
                )}
              </div>

              {hydrated && (
                <div className="flex flex-wrap gap-3">
                  {change.state !== "saved" && (
                    <button type="button" onClick={() => onUndo(change)} className={LINK}>
                      {change.saved === ""
                        ? "Undo — leave it as the theme has it"
                        : "Undo — back to the saved value"}
                    </button>
                  )}
                  {change.draft !== "" && (
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
          <span className="font-medium">Custom CSS</span> has unsaved edits. It is not painted
          in the live sample above — press “Preview without saving” to see it applied.
        </p>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Legibility
 * ------------------------------------------------------------------ */

function ratioLine(check: ContrastCheck): string {
  return check.ratio === null
    ? "not measurable"
    : `${formatRatio(check.ratio)} — needs ${check.required}:1`
}

function Failure({
  check,
  inherited,
}: {
  check: ContrastCheck
  /** True when the board is already painting this failure. */
  inherited: boolean
}) {
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-medium">{check.pair.label}</span>
        <span className="font-mono text-[0.6875rem] tabular-nums">{ratioLine(check)}</span>
      </span>
      <span className="font-mono text-[0.6875rem] text-muted-foreground">
        <a href={`#token-${check.pair.foreground}`} className="underline underline-offset-2">
          {check.pair.foreground}
        </a>{" "}
        on{" "}
        <a href={`#token-${check.pair.background}`} className="underline underline-offset-2">
          {check.pair.background}
        </a>
        {inherited && " · already like this on the board"}
      </span>
    </li>
  )
}

function SchemeReport({
  label,
  draftChecks,
  savedChecks,
}: {
  label: string
  draftChecks: readonly ContrastCheck[]
  savedChecks: readonly ContrastCheck[]
}) {
  const failing = draftChecks.filter((check) => check.state === "fail")
  const unknown = draftChecks.filter((check) => check.state === "unknown")
  const passing = draftChecks.filter((check) => check.state === "pass")

  /* Keyed by the pair, so "was it already failing?" is a lookup and not a guess. */
  const wasFailing = new Set(
    savedChecks
      .filter((check) => check.state === "fail")
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
            />
          ))}
        </ul>
      )}

      {/*
        The passes behind a disclosure rather than absent. An operator who has
        just moved a colour to 4.6:1 wants to see the number, and a panel that
        only ever speaks up to complain teaches people that silence means
        nothing was checked. `<details>` needs no JavaScript.
      */}
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
              <span className="text-muted-foreground">{check.pair.label}</span>
              <span className="font-mono tabular-nums">
                {check.ratio === null
                  ? "—"
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
}: {
  tokens: readonly EditableToken[]
  draft: Draft
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
          Every pair of colours the board actually puts on top of each other, measured against
          WCAG AA — 4.5:1 for text, 3:1 for a focus ring or a field’s edge. Measured from the
          form, so it moves as you do. A value this screen cannot read as a colour —{" "}
          <code>color-mix()</code>, a <code>var()</code>, an alpha channel — is reported as not
          measurable rather than as a pass.
        </p>
      </div>

      {reports.map((report) => (
        <SchemeReport
          key={report.scheme}
          label={report.scheme === "dark" ? "Dark" : "Light"}
          draftChecks={report.draftChecks}
          savedChecks={report.savedChecks}
        />
      ))}
    </section>
  )
}
