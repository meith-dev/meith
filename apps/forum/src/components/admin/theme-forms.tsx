"use client"

/**
 * F68's forms.
 *
 * ## What was wrong with the version this replaces
 *
 * Before that, it was thirty-eight text boxes labelled with token names and
 * prefilled with OKLCH triples — that history is worth keeping because it is
 * what the token descriptions, the grouping and the OKLCH picker were built to
 * fix, and they still are. What the *second* version could not do was tell an
 * operator what they were doing:
 *
 *  - **no answer to "what have I changed?"** Forty-four tokens, each with a line
 *    saying whether it was overridden, and no total anywhere. Three changes were
 *    three rows in a very long form.
 *  - **no difference between saved and unsaved.** The form opened on the stored
 *    values, so an edit and a save looked identical the moment it was typed. The
 *    only way to know whether the board was serving a colour was to leave the
 *    screen and look.
 *  - **no way to find a token.** Forty-four rows in eight groups, all expanded,
 *    no filter. Changing "the colour of a locked thread" meant scrolling.
 *  - **a sample that scrolled away.** The preview sat above the fields, so it
 *    was off-screen for every token below the second group — which is to say for
 *    almost every token.
 *  - **nothing about legibility.** The one property of a palette that the person
 *    choosing it cannot check by looking at it, and the screen was silent.
 *
 * So: the sample is sticky and shows three scenes covering every colour token;
 * a change list names what a save would do, per value, against what the board is
 * painting now; and the contrast of every pair the board actually paints is
 * measured as the form moves.
 *
 * ## The list is a grid, and the sample is the other index
 *
 * A first pass at the length problem folded the groups and added a filter box.
 * Both helped and both treat the symptom: a hundred-and-twenty-pixel row for a
 * value that is one colour is the wrong unit, and the thing being edited is a
 * **palette** — a visual object a column of rows cannot show. So the tokens are
 * swatches (`theme-palette.tsx`), the whole palette is about a screen, and one
 * control opens under its group when a swatch is pressed.
 *
 * The other half is that a swatch grid still asks somebody to recognise a
 * colour out of context. The sample knows which token paints each of its
 * elements, so clicking the locked thread in the preview opens `thread-locked` —
 * no name, no search. Between them the two indexes cover both ways an operator
 * arrives: *I know what it is called* and *I know what it looks like*.
 *
 * ## The picker speaks OKLCH, because the palette does
 *
 * `<input type="color">` speaks six-digit hex and every token this board ships
 * is `oklch()`; handed one it shows black *and reports black when read*, so
 * opening the editor and saving without touching anything rewrote the palette.
 * It also cannot do the two things an operator wants — "the same colour but
 * lighter" and "the same lightness, another hue" — which are one slider each in
 * OKLCH. `OklchPicker` is that control, and the text box is still the field that
 * posts: an empty box is "use the theme's value", which no slider position can
 * express.
 *
 * ## It still works with JavaScript off
 *
 * The live sample, the swatch grid, the filter, the change list's buttons and
 * the scene picker are enhancements, and each is *absent* rather than inert
 * without scripting — a control that does nothing is worse than no control. With
 * scripting off this is the screen it replaces: every token's control expanded,
 * ordinary inputs, "Preview without saving" a second submit on the same form,
 * and a sample the server renders from values it has validated exactly as a save
 * would (D06).
 *
 * The hydration flag is what keeps that honest, and it costs one effect: the
 * first client render must match the server's, so anything JavaScript-only is
 * rendered on the pass *after* mount.
 */
import { useActionState, useEffect, useState } from "react"

import {
  importThemeAction,
  resetThemeAction,
  setDefaultThemeAction,
  setThemeEnabledAction,
  themeEditorAction,
} from "@/server/theme-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"
import { contrastChecksFor, formatRatio, type ContrastCheck } from "@/view/contrast"
import {
  changeCounts,
  cssVariables,
  draftValue,
  effectiveValues,
  fieldName,
  initialDraft,
  matchesQuery,
  savedValue,
  schemesFor,
  shippedValue,
  tokenChanges,
  type Draft,
  type EditableToken,
  type FieldScheme,
} from "@/view/theme-draft"
import { BRAND_PRESETS, groupTokens } from "@/view/theme-tokens"

import { ChangeSummary, LegibilityReport } from "./theme-changes"
import { OklchPicker } from "./oklch-picker"
import { PaletteGrid, type CellState } from "./theme-palette"
import { ThemePreview, ValidatedSample } from "./theme-preview"

import { FormError, SubmitButton } from "../auth/form-controls"

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const GHOST_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const LINK =
  "text-xs font-medium underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** Re-exported under its old name; the shape now lives with the draft rules. */
export type TokenValue = EditableToken

/**
 * False on the server and on the first client render, true afterwards.
 *
 * Every JavaScript-only control on this screen is gated on it. Rendering them
 * only once mounted is what lets the no-JavaScript page be *the same page* —
 * with the enhancements missing rather than present and dead — while keeping the
 * first client render byte-identical to the server's, which is what React asks
 * of hydration.
 */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

function Saved({ when, children }: { when: boolean; children: React.ReactNode }) {
  if (!when) return null
  return (
    <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
      {children}
    </p>
  )
}

function schemeLabel(scheme: FieldScheme): string {
  return scheme === "both" ? "Both schemes" : scheme === "dark" ? "Dark" : "Light"
}

/* ------------------------------------------------------------------ *
 * One token
 * ------------------------------------------------------------------ */

/**
 * The contrast of the pairs this token takes part in, beside the field.
 *
 * Failures first and all of them; if there are none, the tightest passing pair,
 * because "4.6:1" beside a colour somebody is dragging is the number that tells
 * them how much room they have left. The panel at the side has the full list —
 * this is the reading an operator needs without looking away from the slider.
 */
function ContrastNotes({ checks }: { checks: readonly ContrastCheck[] }) {
  const failing = checks.filter((check) => check.state === "fail")
  const tightest = [...checks]
    .filter((check) => check.state === "pass")
    .sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0))[0]

  const shown = failing.length > 0 ? failing : tightest === undefined ? [] : [tightest]
  if (shown.length === 0) return null

  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((check) => (
        <li
          key={`${check.pair.foreground}/${check.pair.background}`}
          className={`text-[0.6875rem] ${
            check.state === "fail" ? "font-medium text-destructive" : "text-muted-foreground"
          }`}
        >
          {check.state === "fail" ? "Too little contrast: " : "Contrast: "}
          {check.pair.label} —{" "}
          <span className="font-mono tabular-nums">
            {check.ratio === null ? "—" : formatRatio(check.ratio)}
          </span>
          {check.state === "fail" && ` (needs ${check.required}:1)`}
        </li>
      ))}
    </ul>
  )
}

/** One token: what it is, what it ships with, and the value that decides it. */
function TokenRow({
  token,
  draft,
  values,
  hidden,
  onChange,
  onClose,
}: {
  token: EditableToken
  draft: Draft
  /** Effective palettes, so a contrast note can be drawn without recomputing. */
  values: { light: Record<string, string>; dark: Record<string, string> }
  hidden: boolean
  onChange: (name: string, value: string) => void
  /** Absent without scripting, where every row is open and none can be shut. */
  onClose?: (() => void) | undefined
}) {
  const overridden = schemesFor(token).some((scheme) => draftValue(draft, token, scheme) !== "")
  const dirty = schemesFor(token).some(
    (scheme) => draftValue(draft, token, scheme) !== savedValue(token, scheme),
  )

  return (
    <div
      id={`token-${token.name}`}
      hidden={hidden}
      className="flex scroll-mt-6 flex-col gap-2 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium">{token.label}</span>
          {dirty && (
            <span className="rounded-full border border-primary px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
              Unsaved
            </span>
          )}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{token.name}</span>
      </div>
      {token.hint !== "" && <p className="text-xs text-muted-foreground">{token.hint}</p>}

      <div className="flex flex-col gap-3 @md:flex-row">
        {schemesFor(token).map((scheme) => {
          const name = fieldName(token.name, scheme)
          const value = draft[name] ?? ""
          const shipped = shippedValue(token, scheme)
          const palette = scheme === "dark" ? values.dark : values.light

          return (
            <div key={scheme} className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted-foreground">{schemeLabel(scheme)}</span>
                {token.kind === "colour" ? (
                  <OklchPicker
                    name={name}
                    value={value}
                    shipped={shipped}
                    onChange={(next) => onChange(name, next)}
                  />
                ) : (
                  <input
                    name={name}
                    value={value}
                    onChange={(event) => onChange(name, event.target.value)}
                    placeholder={shipped}
                    className={INPUT}
                  />
                )}
              </label>

              {/*
                The theme's own value spelled out rather than left in the
                placeholder, which disappears the moment anything is typed —
                taking with it the one reference an operator needs to decide
                whether their change was an improvement.
              */}
              <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
                {value === "" ? "Theme’s own: " : "Replaces: "}
                {shipped}
              </p>

              {token.kind === "colour" && (
                <ContrastNotes checks={contrastChecksFor(token.name, palette)} />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {overridden ? "Overridden by this board." : "Using the theme’s own value."}
        </span>
        {overridden && (
          <button
            type="button"
            onClick={() => {
              for (const scheme of schemesFor(token)) onChange(fieldName(token.name, scheme), "")
            }}
            className={LINK}
          >
            Use the theme&rsquo;s value
          </button>
        )}
        {onClose !== undefined && (
          <button type="button" onClick={onClose} className={LINK}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The editor
 * ------------------------------------------------------------------ */

export function ThemeEditorForm({
  themeKey,
  tokens,
  customCss,
}: {
  themeKey: string
  tokens: readonly EditableToken[]
  customCss: string
}) {
  /*
   * One action state for two submits. Two of them is what a form with a Save and
   * a Preview button reads like, and it is broken without JavaScript — see
   * `themeEditorAction`, which is where the reason is written down.
   */
  const [state, action] = useActionState(themeEditorAction, EMPTY_STATE)
  const hydrated = useHydrated()

  /* The post-back's values seed the fields, so a no-JS preview keeps them. */
  const [draft, setDraft] = useState<Draft>(() => initialDraft(tokens, state.values))
  const [css, setCss] = useState(state.values?.customCss ?? customCss)
  const [query, setQuery] = useState("")
  const [changedOnly, setChangedOnly] = useState(false)

  const groups = groupTokens(tokens)

  /*
   * The token whose full control is open, if any.
   *
   * One at a time, and nothing open to begin with: the grid is the index, and an
   * editor that opens with a row already expanded has answered a question
   * nobody asked and pushed the rest of the palette down the page to do it.
   */
  const [selected, setSelected] = useState<string | null>(null)

  const set = (name: string, value: string): void =>
    setDraft((current) => ({ ...current, [name]: value }))

  const applyPreset = (preset: (typeof BRAND_PRESETS)[number]): void =>
    setDraft((current) => {
      const next = { ...current }
      for (const [name, value] of Object.entries(preset.light)) {
        next[fieldName(name, "light")] = value
      }
      for (const [name, value] of Object.entries(preset.dark)) {
        next[fieldName(name, "dark")] = value
      }
      return next
    })

  const changes = tokenChanges(tokens, draft)
  const counts = changeCounts(changes)
  const customCssChanged = css.trim() !== customCss.trim()
  const unsaved = counts.unsaved + (customCssChanged ? 1 : 0)

  const values = {
    light: effectiveValues(tokens, draft, "light"),
    dark: effectiveValues(tokens, draft, "dark"),
  }

  /*
   * Filtering **hides** rows rather than unmounting them, and that is a
   * correctness rule and not a preference: a field that is not in the DOM is not
   * posted, and this form saves every token at once — so an unmounted row would
   * quietly delete the override it was hiding. The one bug this screen must
   * never have is "saving lost a colour I could not see".
   */
  const changedNames = new Set(changes.filter((c) => c.draft !== "").map((c) => c.token.name))
  const visible = (token: EditableToken): boolean =>
    (!hydrated || matchesQuery(token, query)) &&
    (!hydrated || !changedOnly || changedNames.has(token.name))

  const shown = tokens.filter(visible).length

  /*
   * What the grid marks a swatch with. Three states rather than two, for the
   * same reason the change list has four: "changed" alone cannot distinguish an
   * override the board is serving from one typed a moment ago.
   */
  const cellState = (token: EditableToken): CellState => {
    const fields = schemesFor(token)
    if (fields.some((scheme) => draftValue(draft, token, scheme) !== savedValue(token, scheme))) {
      return "unsaved"
    }
    return fields.some((scheme) => draftValue(draft, token, scheme) !== "") ? "saved" : "clean"
  }

  /**
   * Open a token's control, wherever the operator asked from.
   *
   * The grid, the change list and the sample all land here, and the last of
   * those is why it moves focus rather than only scrolling: a click on the
   * sample is a click on the *far* side of the screen from the field it opens,
   * and leaving somebody to find it themselves is most of the distance the
   * shortcut was meant to save.
   *
   * `preventScroll` because the row is scrolled deliberately a line later —
   * focusing a field the browser has not yet moved to jumps the page to it with
   * the label off the top of the viewport.
   */
  const select = (name: string): void => {
    setSelected(name)
    /* After the render that mounts it, not before. */
    requestAnimationFrame(() => {
      const row = document.getElementById(`token-${name}`)
      row?.scrollIntoView({ block: "nearest" })
      row?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true })
    })
  }

  const undo = (name: string, scheme: FieldScheme, to: string): void =>
    set(fieldName(name, scheme), to)

  const discardAll = (): void => {
    setDraft(initialDraft(tokens, undefined))
    setCss(customCss)
  }

  return (
    /*
      Two columns at `xl` and not at `lg`, which is a measurement rather than a
      taste: the panel already spends about 200px on its rail, a token row holds
      two colour pickers side by side, and a sample has to be wide enough to look
      like a forum. Split at 1024px all three are too narrow to use, and the
      screen is worse than the one column it replaced.
    */
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start">
      {/*
        `@container`, so the controls inside respond to *this column's* width
        rather than the window's. The column is about 500px on a 1600px screen —
        the panel caps itself at `max-w-6xl` and spends 200px of it on the rail —
        so a viewport-width breakpoint says "wide" about a place that is not.
      */}
      <div className="@container flex min-w-0 flex-col gap-6">
        <FormError message={state.error} />
        <Saved when={state.notice === "saved"}>
          Saved. The board is rendering these values now.
        </Saved>

        <form action={action} className="flex flex-col gap-6" noValidate>
          <input type="hidden" name="key" value={themeKey} />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Brand palettes</legend>
            <p className="text-xs text-muted-foreground">
              Sets the accent, its hover step, the text on it and the focus ring, for both
              schemes at once — the four tokens that brand a board whose palette is otherwise
              colourless. The board ships with <span className="font-medium">Meith green</span>;
              pressing it again puts back the shipped accent after trying another. Nothing is
              saved until you press Save.
            </p>
            <div className="flex flex-wrap gap-2">
              {BRAND_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={GHOST_BUTTON}
                >
                  <span
                    aria-hidden
                    className="mr-2 inline-block size-3 rounded-full border border-border"
                    style={{ background: preset.light.primary }}
                  />
                  {preset.title}
                </button>
              ))}
            </div>
          </fieldset>

          {hydrated && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">Find a token</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="button, locked, primary…"
                  /*
                    Deliberately unnamed. Every other input in this form posts a
                    token; a filter box that submitted its contents would arrive
                    at `submittedTokens` as a field it has to know to ignore.
                  */
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {/*
                  Absent rather than disabled when there is nothing to narrow to:
                  "only the 0 tokens this board has changed" is a control whose
                  own label says it does nothing.
                */}
                {counts.tokens > 0 ? (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={changedOnly}
                      onChange={(event) => setChangedOnly(event.target.checked)}
                      className="size-4 accent-primary"
                    />
                    Only the {counts.tokens} token{counts.tokens === 1 ? "" : "s"} this board has
                    changed
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Nothing is overridden yet.
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {shown} of {tokens.length} shown
                </span>
              </div>
            </div>
          )}

          {groups.map((group) => {
            const matches = group.tokens.filter(visible).length
            const changed = group.tokens.filter((token) => changedNames.has(token.name)).length

            return (
              <fieldset
                key={group.title}
                hidden={hydrated && matches === 0}
                className="flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <legend className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
                  <span className="text-sm font-medium">{group.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {changed > 0 && (
                      <span className="mr-2 font-medium text-primary">{changed} changed</span>
                    )}
                    {group.tokens.length} token{group.tokens.length === 1 ? "" : "s"}
                  </span>
                </legend>

                <p className="text-xs text-muted-foreground">{group.blurb}</p>

                {/*
                  The grid is the index and it is JavaScript-only, because a
                  swatch that opens a control is a control. With scripting off
                  every row below is expanded instead, which is the same screen
                  with the shorthand missing rather than a screen with dead
                  buttons on it.
                */}
                {hydrated && (
                  <PaletteGrid
                    cells={group.tokens.map((token) => ({
                      token,
                      light: values.light[token.name] ?? "",
                      dark: values.dark[token.name] ?? "",
                      state: cellState(token),
                      visible: visible(token),
                    }))}
                    selected={selected}
                    onSelect={(name) => (selected === name ? setSelected(null) : select(name))}
                  />
                )}

                {/*
                  Every row stays mounted, always. A field that is not in the DOM
                  is not posted and this form saves every token at once, so an
                  unmounted row would silently delete the override it was
                  hiding — the one bug this screen must never have is "saving
                  lost a colour I could not see".
                */}
                <div className="flex flex-col divide-y divide-border">
                  {group.tokens.map((token) => (
                    <TokenRow
                      key={token.name}
                      token={token}
                      draft={draft}
                      values={values}
                      hidden={hydrated && (selected !== token.name || !visible(token))}
                      onChange={set}
                      onClose={hydrated ? () => setSelected(null) : undefined}
                    />
                  ))}
                </div>
              </fieldset>
            )
          })}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Custom CSS</span>
            <textarea
              name="customCss"
              rows={10}
              value={css}
              onChange={(event) => setCss(event.target.value)}
              className={INPUT}
            />
            <span className="text-xs text-muted-foreground">
              Appended after the theme&rsquo;s own styles. <code>@import</code>, <code>url(</code>{" "}
              and a closing style tag are refused — those are how a stylesheet stops being a
              stylesheet. When more than one theme is enabled this is nested under the
              theme&rsquo;s own selector, so it stops applying the moment a member picks a
              different one; a rule aimed at <code>:root</code> will not match there, so target{" "}
              <code>body</code> or a class instead.
            </span>
          </label>

          {/*
            The bar follows the form down the page, because the decision it
            carries is made while looking at a field two thousand pixels below
            the top of the screen — and because "how many changes am I about to
            make?" is a question that should never require scrolling to answer.
          */}
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background px-1 py-3">
            <span className="min-w-40">
              <SubmitButton>
                {unsaved === 0 ? "Save" : `Save ${unsaved} change${unsaved === 1 ? "" : "s"}`}
              </SubmitButton>
            </span>
            {/*
              A second submit on the same form, saying which of the two things
              the one action should do. No JavaScript is involved: a browser
              posts the name and value of the button that was pressed, which is
              the whole mechanism.
            */}
            <button
              type="submit"
              name="intent"
              value="preview"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm"
            >
              Preview without saving
            </button>
            <span className="text-xs text-muted-foreground">
              {unsaved === 0
                ? "Nothing to save — the board is painting what is in this form."
                : `${unsaved} unsaved change${unsaved === 1 ? "" : "s"}. Nothing reaches the board until you save.`}
            </span>
          </div>
        </form>
      </div>

      {/*
        The sample and the two reports travel with the form on a wide screen.
        The whole argument for a live preview is that it answers a question you
        are asking *while* you change a value, and a preview at the top of a page
        forty rows long answers it for the first two groups only.
      */}
      <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
        <ThemePreview
          light={cssVariables(values.light) as React.CSSProperties}
          dark={cssVariables(values.dark) as React.CSSProperties}
          hydrated={hydrated}
          onPick={hydrated ? select : undefined}
        />

        {state.preview !== undefined && (
          <section className="flex flex-col gap-3">
            <h3 className="text-base font-semibold tracking-tight">Validated preview</h3>
            <p className="text-xs text-muted-foreground">
              Rendered by the board from values it has validated exactly as a save would, custom
              CSS included.
            </p>
            {/*
              The block is the action's own output, built from values F26's
              validator has already accepted — the same function the render path
              runs. It is the one place in this screen markup is inserted rather
              than escaped.
            */}
            <style dangerouslySetInnerHTML={{ __html: state.preview }} />
            <ValidatedSample />
          </section>
        )}

        <ChangeSummary
          changes={changes}
          customCssChanged={customCssChanged}
          hydrated={hydrated}
          onUndo={(change) => undo(change.token.name, change.scheme, change.saved)}
          onClear={(change) => undo(change.token.name, change.scheme, "")}
          onDiscardAll={discardAll}
        />

        <LegibilityReport tokens={tokens} draft={draft} />
      </aside>
    </div>
  )
}

export function ResetThemeForm({ themeKey }: { themeKey: string }) {
  const [state, action] = useActionState(resetThemeAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <Saved when={state.notice === "reset"}>
        Reset. The board looks exactly as the theme ships.
      </Saved>
      <input type="hidden" name="key" value={themeKey} />
      <div>
        <SubmitButton>Reset to the theme&rsquo;s own values</SubmitButton>
      </div>
    </form>
  )
}

export function ImportThemeForm({ themeKey }: { themeKey: string }) {
  const [state, action] = useActionState(importThemeAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "imported"}>
        Imported. Every override in the file is now this board&rsquo;s.
      </Saved>
      <input type="hidden" name="key" value={themeKey} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Paste an exported theme</span>
        <textarea name="document" rows={8} className={INPUT} required />
        <span className="text-xs text-muted-foreground">
          Replaces every override this board has. The key inside the file is ignored — copying a
          look from another board is what this is for.
        </span>
      </label>

      <div>
        <SubmitButton>Import</SubmitButton>
      </div>
    </form>
  )
}

/**
 * Turn a theme on or off, and choose the board's default.
 *
 * One-button forms rather than a checkbox that saves on change: a control that
 * acts on `onChange` does nothing at all with scripting off, and this screen
 * decides what every member of the board can see.
 */
export function ThemeStateForms({
  themeKey,
  enabled,
  isDefault,
  isBuildTheme,
}: {
  themeKey: string
  enabled: boolean
  isDefault: boolean
  isBuildTheme: boolean
}) {
  const [enabledState, enabledAction] = useActionState(setThemeEnabledAction, EMPTY_STATE)
  const [defaultState, defaultAction] = useActionState(setDefaultThemeAction, EMPTY_STATE)

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <FormError message={enabledState.error ?? defaultState.error} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isDefault && enabled && (
          <form action={defaultAction}>
            <input type="hidden" name="key" value={themeKey} />
            <button type="submit" className={GHOST_BUTTON}>
              Make default
            </button>
          </form>
        )}

        {/*
          The build's theme has no toggle at all rather than a disabled one: its
          components are what every page renders, so "off" is not a state this
          board can be in, and a control that refuses is a worse answer than a
          control that is not there. The reason is written beside it in the list.
        */}
        {!isBuildTheme && !isDefault && (
          <form action={enabledAction}>
            <input type="hidden" name="key" value={themeKey} />
            <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
            <button type="submit" className={GHOST_BUTTON}>
              {enabled ? "Turn off" : "Turn on"}
            </button>
          </form>
        )}

        <a
          href={`/admin/themes/${themeKey}`}
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
        >
          Customise
        </a>
      </div>
    </div>
  )
}
