"use client"

/**
 * F68's forms.
 *
 * One form covers the tokens, the custom CSS and the preview, because they are
 * one edit: previewing a colour without the CSS that uses it would preview
 * something the board will never look like. The preview button and the save
 * button are two submits on the same form — with no JavaScript, that is exactly
 * how a browser behaves.
 */
import { useActionState } from "react"

import {
  importThemeAction,
  previewThemeAction,
  resetThemeAction,
  saveThemeAction,
} from "@/server/theme-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

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
  readonly light: string
  readonly dark: string
  readonly override: string
}

/**
 * A sample of real board chrome, painted with whatever the preview supplied.
 *
 * Real elements rather than colour swatches: an operator is choosing whether
 * their board is readable, and a row of squares cannot answer that. It carries
 * `data-theme-preview` so the style block the action produced applies here and
 * nowhere else — previewing an unreadable colour must not make the form that
 * changes it back unreadable too.
 */
function PreviewSample({ css }: { css: string }) {
  return (
    <div className="flex flex-col gap-3">
      {/*
        The block is the action's own output, built from values F26's validator
        has already accepted — the same function the render path runs. It is the
        one place in this screen markup is inserted rather than escaped.
      */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div
        data-theme-preview
        className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-foreground"
      >
        <div className="rounded-md border border-border bg-card p-3 text-card-foreground">
          <p className="font-serif text-base font-semibold">A forum</p>
          <p className="text-xs text-muted-foreground">
            Last post by a member, a moment ago
          </p>
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

        <p className="text-sm">
          Body text, with <a href="#preview" className="font-medium text-foreground underline decoration-border underline-offset-2">a link</a> and{" "}
          <span className="text-muted-foreground">muted secondary text</span>.
        </p>
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

  /* The pending values win, so a preview does not throw away what was typed. */
  const valueFor = (name: string): string =>
    preview.values?.[`token.${name}`] ??
    tokens.find((token) => token.name === name)?.override ??
    ""
  const cssValue = preview.values?.customCss ?? customCss

  return (
    <div className="flex flex-col gap-6">
      <FormError message={state.error ?? preview.error} />
      <Saved when={state.notice === "saved"}>
        Saved. The board is rendering these values now.
      </Saved>

      {preview.preview !== undefined && (
        <section className="flex flex-col gap-3">
          <h3 className="font-serif text-base font-semibold">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Nothing has been saved. This is what a save would paint.
          </p>
          <PreviewSample css={preview.preview} />
        </section>
      )}

      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="key" value={themeKey} />

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Tokens</legend>
          <p className="text-xs text-muted-foreground">
            Leave a box empty to use the value the theme ships with — shown
            beside it. A token set here applies in both light and dark.
          </p>

          <div className="flex flex-col divide-y divide-border">
            {tokens.map((token) => (
              <label key={token.name} className="flex flex-col gap-1 py-2 text-sm">
                <span className="font-mono text-xs font-medium">{token.name}</span>
                <input
                  name={`token.${token.name}`}
                  defaultValue={valueFor(token.name)}
                  placeholder={token.light}
                  className={INPUT}
                />
                <span className="text-xs text-muted-foreground">
                  ships as {token.light}
                  {token.dark !== token.light && ` — dark: ${token.dark}`}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Custom CSS</span>
          <textarea name="customCss" rows={10} defaultValue={cssValue} className={INPUT} />
          <span className="text-xs text-muted-foreground">
            Appended after the theme&rsquo;s own styles. `@import`, `url(` and a
            closing style tag are refused — those are how a stylesheet stops
            being a stylesheet.
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
