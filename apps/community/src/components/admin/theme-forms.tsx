'use client'

import { useActionState, useEffect, useState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  importThemeAction,
  resetThemeAction,
  setDefaultThemeAction,
  setThemeEnabledAction,
  themeEditorAction,
} from '@/server/theme-admin-actions'
import { type ContrastCheck, contrastChecksFor, formatRatio } from '@/view/contrast'
import {
  changeCounts,
  cssVariables,
  type Draft,
  draftValue,
  type EditableToken,
  effectiveValues,
  type FieldScheme,
  fieldName,
  initialDraft,
  matchesQuery,
  savedValue,
  schemesFor,
  shippedValue,
  tokenChanges,
} from '@/view/theme-draft'
import { BRAND_PRESETS, groupTokens } from '@/view/theme-tokens'

import { FormError, SubmitButton } from '../auth/form-controls'
import { Saved } from './form-bits'
import { OklchPicker } from './oklch-picker'
import { ChangeSummary, LegibilityReport } from './theme-changes'
import { type CellState, PaletteGrid } from './theme-palette'
import { ThemePreview, ValidatedSample } from './theme-preview'

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const GHOST_BUTTON =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const LINK =
  'text-xs font-medium underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export type TokenValue = EditableToken

function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

function schemeLabel(scheme: FieldScheme): string {
  return scheme === 'both' ? 'Both schemes' : scheme === 'dark' ? 'Dark' : 'Light'
}

function ContrastNotes({ checks }: { checks: readonly ContrastCheck[] }) {
  const failing = checks.filter((check) => check.state === 'fail')
  const tightest = [...checks]
    .filter((check) => check.state === 'pass')
    .sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0))[0]

  const shown = failing.length > 0 ? failing : tightest === undefined ? [] : [tightest]
  if (shown.length === 0) return null

  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((check) => (
        <li
          key={`${check.pair.foreground}/${check.pair.background}`}
          className={`text-[0.6875rem] ${
            check.state === 'fail' ? 'font-medium text-destructive' : 'text-muted-foreground'
          }`}
        >
          {check.state === 'fail' ? 'Too little contrast: ' : 'Contrast: '}
          {check.pair.label} —{' '}
          <span className="font-mono tabular-nums">
            {check.ratio === null ? '—' : formatRatio(check.ratio)}
          </span>
          {check.state === 'fail' && ` (needs ${check.required}:1)`}
        </li>
      ))}
    </ul>
  )
}

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
  values: { light: Record<string, string>; dark: Record<string, string> }
  hidden: boolean
  onChange: (name: string, value: string) => void
  onClose?: (() => void) | undefined
}) {
  const overridden = schemesFor(token).some((scheme) => draftValue(draft, token, scheme) !== '')
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
      {token.hint !== '' && <p className="text-xs text-muted-foreground">{token.hint}</p>}

      <div className="flex flex-col gap-3 @md:flex-row">
        {schemesFor(token).map((scheme) => {
          const name = fieldName(token.name, scheme)
          const value = draft[name] ?? ''
          const shipped = shippedValue(token, scheme)
          const palette = scheme === 'dark' ? values.dark : values.light

          return (
            <div key={scheme} className="flex min-w-0 flex-1 flex-col gap-1">
              {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is OklchPicker, or the text input on the other side of the branch */}
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted-foreground">{schemeLabel(scheme)}</span>
                {token.kind === 'colour' ? (
                  <OklchPicker
                    name={name}
                    describes={`${token.label}, ${schemeLabel(scheme).toLowerCase()}`}
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

              <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
                {value === '' ? 'Theme’s own: ' : 'Replaces: '}
                {shipped}
              </p>

              {token.kind === 'colour' && (
                <ContrastNotes checks={contrastChecksFor(token.name, palette)} />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {overridden ? 'Overridden by this board.' : 'Using the theme’s own value.'}
        </span>
        {overridden && (
          <button
            type="button"
            onClick={() => {
              for (const scheme of schemesFor(token)) onChange(fieldName(token.name, scheme), '')
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

export function ThemeEditorForm({
  themeKey,
  tokens,
  customCss,
  isDefault,
}: {
  themeKey: string
  tokens: readonly EditableToken[]
  customCss: string
  isDefault: boolean
}) {
  const [state, action] = useActionState(themeEditorAction, EMPTY_STATE)
  const hydrated = useHydrated()

  const [draft, setDraft] = useState<Draft>(() => initialDraft(tokens, state.values))
  const [css, setCss] = useState(state.values?.customCss ?? customCss)
  const [query, setQuery] = useState('')
  const [changedOnly, setChangedOnly] = useState(false)

  const groups = groupTokens(tokens)

  const [selected, setSelected] = useState<string | null>(null)

  const set = (name: string, value: string): void =>
    setDraft((current) => ({ ...current, [name]: value }))

  const applyPreset = (preset: (typeof BRAND_PRESETS)[number]): void =>
    setDraft((current) => {
      const next = { ...current }
      for (const [name, value] of Object.entries(preset.light)) {
        next[fieldName(name, 'light')] = value
      }
      for (const [name, value] of Object.entries(preset.dark)) {
        next[fieldName(name, 'dark')] = value
      }
      return next
    })

  const changes = tokenChanges(tokens, draft)
  const counts = changeCounts(changes)
  const customCssChanged = css.trim() !== customCss.trim()
  const unsaved = counts.unsaved + (customCssChanged ? 1 : 0)

  const values = {
    light: effectiveValues(tokens, draft, 'light'),
    dark: effectiveValues(tokens, draft, 'dark'),
  }

  const changedNames = new Set(changes.filter((c) => c.draft !== '').map((c) => c.token.name))
  const visible = (token: EditableToken): boolean =>
    (!hydrated || matchesQuery(token, query)) &&
    (!hydrated || !changedOnly || changedNames.has(token.name))

  const shown = tokens.filter(visible).length

  const cellState = (token: EditableToken): CellState => {
    const fields = schemesFor(token)
    if (fields.some((scheme) => draftValue(draft, token, scheme) !== savedValue(token, scheme))) {
      return 'unsaved'
    }
    return fields.some((scheme) => draftValue(draft, token, scheme) !== '') ? 'saved' : 'clean'
  }

  const select = (name: string): void => {
    setSelected(name)
    requestAnimationFrame(() => {
      const row = document.getElementById(`token-${name}`)
      row?.scrollIntoView({ block: 'nearest' })
      row?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    })
  }

  const undo = (name: string, scheme: FieldScheme, to: string): void =>
    set(fieldName(name, scheme), to)

  const discardAll = (): void => {
    setDraft(initialDraft(tokens, undefined))
    setCss(customCss)
  }

  return (
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start">
      <div className="@container flex min-w-0 flex-col gap-6">
        <FormError message={state.error} />
        <Saved when={state.notice === 'saved'}>
          Saved. The board is rendering these values now.
        </Saved>

        <form action={action} className="flex flex-col gap-6" noValidate>
          <input type="hidden" name="key" value={themeKey} />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Brand palettes</legend>
            <p className="text-xs text-muted-foreground">
              Sets the accent, its hover step, the text on it and the focus ring, for both schemes
              at once — the four tokens that brand a board whose palette is otherwise colourless.
              The board ships with <span className="font-medium">Meith green</span>; pressing it
              again puts back the shipped accent after trying another. Nothing is saved until you
              press Save.
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
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {counts.tokens > 0 ? (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={changedOnly}
                      onChange={(event) => setChangedOnly(event.target.checked)}
                      className="size-4 accent-primary"
                    />
                    Only the {counts.tokens} token{counts.tokens === 1 ? '' : 's'} this board has
                    changed
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">Nothing is overridden yet.</span>
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
                    {group.tokens.length} token{group.tokens.length === 1 ? '' : 's'}
                  </span>
                </legend>

                <p className="text-xs text-muted-foreground">{group.blurb}</p>

                {hydrated && (
                  <PaletteGrid
                    cells={group.tokens.map((token) => ({
                      token,
                      light: values.light[token.name] ?? '',
                      dark: values.dark[token.name] ?? '',
                      state: cellState(token),
                      visible: visible(token),
                    }))}
                    selected={selected}
                    onSelect={(name) => (selected === name ? setSelected(null) : select(name))}
                  />
                )}

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
              Appended after the theme&rsquo;s own styles. <code>@import</code>, <code>url(</code>{' '}
              and a closing style tag are refused — those are how a stylesheet stops being a
              stylesheet.{' '}
              {isDefault ? (
                <>
                  This is the board&rsquo;s default theme, so what you write here goes into the page
                  unscoped: it applies to every member, including one who has picked another theme.
                  Rules meant for this theme alone belong on a theme that is not the default.
                </>
              ) : (
                <>
                  This theme is not the board default, so what you write here is nested under its
                  own selector and stops applying the moment a member picks a different theme; a
                  rule aimed at <code>:root</code> will not match there, so target <code>body</code>{' '}
                  or a class instead.
                </>
              )}
            </span>
          </label>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background px-1 py-3">
            <span className="min-w-40">
              <SubmitButton>
                {unsaved === 0 ? 'Save' : `Save ${unsaved} change${unsaved === 1 ? '' : 's'}`}
              </SubmitButton>
            </span>
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
                ? 'Nothing to save — the board is painting what is in this form.'
                : `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}. Nothing reaches the board until you save.`}
            </span>
          </div>
        </form>
      </div>

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
              Rendered by the board from values it has validated exactly as a save would, custom CSS
              included.
            </p>
            <style dangerouslySetInnerHTML={{ __html: state.preview }} />
            <ValidatedSample />
          </section>
        )}

        <ChangeSummary
          changes={changes}
          customCssChanged={customCssChanged}
          hydrated={hydrated}
          onUndo={(change) => undo(change.token.name, change.scheme, change.saved)}
          onClear={(change) => undo(change.token.name, change.scheme, '')}
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
      <Saved when={state.notice === 'reset'}>
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
      <Saved when={state.notice === 'imported'}>
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

export function ThemeStateForms({
  themeKey,
  title,
  enabled,
  isDefault,
  isBuildTheme,
}: {
  themeKey: string
  title: string
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
            <button type="submit" aria-label={`Make ${title} the default`} className={GHOST_BUTTON}>
              Make default
            </button>
          </form>
        )}

        {!isBuildTheme && !isDefault && (
          <form action={enabledAction}>
            <input type="hidden" name="key" value={themeKey} />
            <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
            <button
              type="submit"
              aria-label={enabled ? `Turn ${title} off` : `Turn ${title} on`}
              className={GHOST_BUTTON}
            >
              {enabled ? 'Turn off' : 'Turn on'}
            </button>
          </form>
        )}

        <a
          href={`/admin/themes/${themeKey}`}
          aria-label={`Customise ${title}`}
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
        >
          Customise
        </a>
      </div>
    </div>
  )
}
