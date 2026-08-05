"use client"

/**
 * F68's forms.
 *
 * ## What was wrong with the version this replaces
 *
 * It was thirty-eight text boxes. Each was labelled with a token name, each was
 * prefilled with an OKLCH triple, each applied to light *and* dark at once, and
 * the only way to see the result was to press a button that posted the whole
 * form back. Every part of that is defensible as data entry and none of it is
 * defensible as choosing a colour: an operator who wanted a blue "post reply"
 * button had to know that the token was called `primary`, that OKLCH is
 * lightness-chroma-hue, and that setting it would also change dark mode.
 *
 * So: the tokens are grouped and described in English, a colour token gets the
 * platform's own colour picker beside its text box, light and dark are separate
 * fields, the sample repaints as the picker moves, and five one-click brand
 * palettes cover the case almost every board actually has.
 *
 * ## The text box is still the field that is submitted
 *
 * The colour picker carries no `name`. It drives the text box beside it, and
 * the text box is what posts. Two reasons, and the second is the important one:
 * a native colour input always submits *something*, so letting it post would
 * turn "I did not touch this" into an override of every colour on the board;
 * and the text box accepts what the picker cannot express — `oklch()`, a named
 * colour, a `color-mix()` — which is what keeps this screen from being a
 * downgrade for somebody who knew what they were doing.
 *
 * ## It still works with JavaScript off
 *
 * The live sample is an enhancement. With scripting off the fields are ordinary
 * inputs, "Preview without saving" is a second submit on the same form, and the
 * server renders a sample from values it has validated exactly as a save would
 * (D06).
 */
import { useActionState, useState } from "react"

import {
  importThemeAction,
  previewThemeAction,
  resetThemeAction,
  saveThemeAction,
  setDefaultThemeAction,
  setThemeEnabledAction,
} from "@/server/theme-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"
import { BRAND_PRESETS, groupTokens, pickerValue, type TokenKind } from "@/view/theme-tokens"

import { FormError, SubmitButton } from "../auth/form-controls"

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const GHOST_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

function Saved({ when, children }: { when: boolean; children: React.ReactNode }) {
  if (!when) return null
  return (
    <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
      {children}
    </p>
  )
}

export interface TokenValue {
  readonly name: string
  readonly label: string
  readonly hint: string
  readonly kind: TokenKind
  readonly light: string
  readonly dark: string
  readonly lightHex: string | null
  readonly darkHex: string | null
  readonly overrideLight: string
  readonly overrideDark: string
}

/** Every field name the form posts, and what is in it right now. */
type Draft = Record<string, string>

type Scheme = "light" | "dark" | "both"

function field(name: string, scheme: Scheme): string {
  return `token.${scheme}.${name}`
}

/** A token that means the same thing in both schemes posts one value. */
function schemesFor(token: TokenValue): readonly Scheme[] {
  return token.kind === "colour" ? ["light", "dark"] : ["both"]
}

function initialDraft(tokens: readonly TokenValue[], restored: Draft | undefined): Draft {
  const draft: Draft = {}
  for (const token of tokens) {
    for (const scheme of schemesFor(token)) {
      const stored = scheme === "dark" ? token.overrideDark : token.overrideLight
      draft[field(token.name, scheme)] = restored?.[field(token.name, scheme)] ?? stored
    }
  }
  return draft
}

/**
 * The palette the live sample paints with, for one scheme.
 *
 * The **whole** palette, not just the overrides. The sample sits inside the
 * control panel, which is painted by `:root` — so an alternate theme previewed
 * with only its overrides declared would show the *board's* colours everywhere
 * it had not overridden one, which is precisely the mistake this screen exists
 * to prevent an operator making.
 *
 * Set through React's `style` prop rather than a generated `<style>` block, so
 * a half-typed value is a property the browser drops rather than a string this
 * component has to sanitise. The saved values still go through F26's validator
 * on the server; nothing here is load-bearing for safety.
 */
function paletteFor(
  tokens: readonly TokenValue[],
  draft: Draft,
  scheme: "light" | "dark",
): React.CSSProperties {
  const style: Record<string, string> = {}
  for (const token of tokens) {
    const key = token.kind === "colour" ? scheme : "both"
    const override = draft[field(token.name, key)]?.trim() ?? ""
    style[`--${token.name}`] =
      override === "" ? (scheme === "dark" ? token.dark : token.light) : override
  }
  return style as React.CSSProperties
}

/**
 * A sample of real board chrome, painted with whatever is in the form.
 *
 * Real elements rather than colour swatches: an operator is choosing whether
 * their board is readable, and a row of squares cannot answer that. Both
 * schemes are shown at once because they are one decision — the commonest way
 * to ruin a board from this screen is to pick a colour that works on white and
 * never look at it on black.
 *
 * `data-theme-preview` is for the no-JavaScript path, whose style block the
 * server scopes to that attribute so a preview cannot restyle the form around
 * it.
 */
function PreviewSample({
  palette,
  dark,
  label,
}: {
  palette: React.CSSProperties
  dark?: boolean
  label: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        data-theme-preview
        style={palette}
        className={`flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-foreground ${
          dark === true ? "dark" : ""
        }`}
      >
        <div className="rounded-md border border-border bg-card p-3 text-card-foreground">
          <p className="font-serif text-base font-semibold">A forum</p>
          <p className="text-xs text-muted-foreground">Last post by a member, a moment ago</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground">
            Post reply
          </span>
          <span className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm text-secondary-foreground">
            Preview
          </span>
          <span className="inline-flex h-9 items-center rounded-md bg-destructive px-3 text-sm text-destructive-foreground">
            Delete
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-medium text-forum-unread">Unread forum</span>
          <span className="text-forum-read">Read forum</span>
          <span className="text-thread-pinned">Pinned</span>
          <span className="text-thread-locked">Locked</span>
          <span className="text-group-admin">Administrator</span>
        </div>

        <p className="rounded-md bg-post-highlight p-2 text-sm">
          A highlighted post, with{" "}
          <span className="text-muted-foreground">muted secondary text</span> beside it.
        </p>
      </div>
    </div>
  )
}

/** One token: what it is, and the one or two values that decide it. */
function TokenRow({
  token,
  draft,
  onChange,
}: {
  token: TokenValue
  draft: Draft
  onChange: (name: string, value: string) => void
}) {
  const shipped = (scheme: Scheme): string => (scheme === "dark" ? token.dark : token.light)
  const shippedHex = (scheme: Scheme): string | null =>
    scheme === "dark" ? token.darkHex : token.lightHex

  const touched = schemesFor(token).some(
    (scheme) => (draft[field(token.name, scheme)] ?? "") !== "",
  )

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{token.label}</span>
        <span className="font-mono text-xs text-muted-foreground">{token.name}</span>
      </div>
      {token.hint !== "" && <p className="text-xs text-muted-foreground">{token.hint}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        {schemesFor(token).map((scheme) => {
          const name = field(token.name, scheme)
          const value = draft[name] ?? ""
          return (
            <label key={scheme} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {scheme === "both" ? "Both schemes" : scheme === "dark" ? "Dark" : "Light"}
              </span>
              <span className="flex items-center gap-2">
                {token.kind === "colour" && (
                  <input
                    type="color"
                    aria-label={`${token.label}, ${scheme} colour picker`}
                    value={pickerValue(value, shippedHex(scheme))}
                    onChange={(event) => onChange(name, event.target.value)}
                    className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                )}
                <input
                  name={name}
                  value={value}
                  onChange={(event) => onChange(name, event.target.value)}
                  placeholder={shipped(scheme)}
                  className={INPUT}
                />
              </span>
            </label>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {touched ? "Overridden by this board." : "Using the theme’s own value."}
        </span>
        {touched && (
          <button
            type="button"
            onClick={() => {
              for (const scheme of schemesFor(token)) onChange(field(token.name, scheme), "")
            }}
            className="text-xs font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            Use the theme&rsquo;s value
          </button>
        )}
      </div>
    </div>
  )
}

export function ThemeEditorForm({
  themeKey,
  tokens,
  customCss,
}: {
  themeKey: string
  tokens: readonly TokenValue[]
  customCss: string
}) {
  const [state, action] = useActionState(saveThemeAction, EMPTY_STATE)
  const [preview, previewAction] = useActionState(previewThemeAction, EMPTY_STATE)

  /* The post-back's values seed the fields, so a no-JS preview keeps them. */
  const [draft, setDraft] = useState<Draft>(() => initialDraft(tokens, preview.values))
  const [css, setCss] = useState(preview.values?.customCss ?? customCss)

  const set = (name: string, value: string): void =>
    setDraft((current) => ({ ...current, [name]: value }))

  const applyPreset = (preset: (typeof BRAND_PRESETS)[number]): void =>
    setDraft((current) => {
      const next = { ...current }
      for (const [name, value] of Object.entries(preset.light)) next[field(name, "light")] = value
      for (const [name, value] of Object.entries(preset.dark)) next[field(name, "dark")] = value
      return next
    })

  const groups = groupTokens(tokens)

  return (
    <div className="flex flex-col gap-6">
      <FormError message={state.error ?? preview.error} />
      <Saved when={state.notice === "saved"}>
        Saved. The board is rendering these values now.
      </Saved>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-serif text-base font-semibold">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Nothing has been saved. Both schemes are shown because they are one
            decision — a colour that works on white often disappears on black.
            Custom CSS is not painted here; &ldquo;Preview without saving&rdquo;
            includes it.
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <PreviewSample label="Light" palette={paletteFor(tokens, draft, "light")} />
          <PreviewSample label="Dark" palette={paletteFor(tokens, draft, "dark")} dark />
        </div>
      </section>

      {preview.preview !== undefined && (
        <section className="flex flex-col gap-3">
          <h3 className="font-serif text-base font-semibold">Validated preview</h3>
          <p className="text-xs text-muted-foreground">
            Rendered by the board from values it has validated exactly as a save
            would, custom CSS included. Light only — the dark values are in the
            live sample above.
          </p>
          {/*
            The block is the action's own output, built from values F26's
            validator has already accepted — the same function the render path
            runs. It is the one place in this screen markup is inserted rather
            than escaped.
          */}
          <style dangerouslySetInnerHTML={{ __html: preview.preview }} />
          <PreviewSample label="As the board would render it" palette={{}} />
        </section>
      )}

      <form action={action} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="key" value={themeKey} />

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Brand palettes</legend>
          <p className="text-xs text-muted-foreground">
            Sets the accent colour, the text on it and the focus ring, for both
            schemes at once — the three tokens that brand a board whose default
            palette holds no hue at all. Nothing is saved until you press Save.
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

        {groups.map((group) => (
          <fieldset key={group.title} className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{group.title}</legend>
            <p className="text-xs text-muted-foreground">{group.blurb}</p>
            <div className="flex flex-col divide-y divide-border">
              {group.tokens.map((token) => (
                <TokenRow key={token.name} token={token} draft={draft} onChange={set} />
              ))}
            </div>
          </fieldset>
        ))}

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
            Appended after the theme&rsquo;s own styles. <code>@import</code>,{" "}
            <code>url(</code> and a closing style tag are refused — those are how
            a stylesheet stops being a stylesheet. When more than one theme is
            enabled this is nested under the theme&rsquo;s own selector, so it
            stops applying the moment a member picks a different one; a rule
            aimed at <code>:root</code> will not match there, so target{" "}
            <code>body</code> or a class instead.
          </span>
        </label>

        <div className="flex flex-wrap gap-3">
          <span className="min-w-40">
            <SubmitButton>Save</SubmitButton>
          </span>
          {/*
            A second submit on the same form, with its own action. No JavaScript
            is involved: this is what a browser does with two submit buttons.
          */}
          <button
            type="submit"
            formAction={previewAction}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm"
          >
            Preview without saving
          </button>
        </div>
      </form>
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
          Replaces every override this board has. The key inside the file is
          ignored — copying a look from another board is what this is for.
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
