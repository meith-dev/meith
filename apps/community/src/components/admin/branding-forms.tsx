"use client"

import { useActionState } from "react"

import { removeLogoAction, saveLogoAction } from "@/server/branding-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"

export interface LogoSlot {
  readonly scheme: "light" | "dark"
  readonly label: string
  readonly hint: string
  readonly src: string | null
}

const GHOST =
  "inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export function LogoUploadForm({ slot, maxKib }: { slot: LogoSlot; maxKib: number }) {
  const [saved, saveAction] = useActionState(saveLogoAction, EMPTY_STATE)
  const [removed, removeAction] = useActionState(removeLogoAction, EMPTY_STATE)

  const id = `logo-${slot.scheme}`

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{slot.label}</h3>
        <p className="text-xs text-muted-foreground">{slot.hint}</p>
      </div>

      <FormError message={saved.error ?? removed.error} />
      {saved.notice === "saved" && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Saved. The header is showing it now.
        </p>
      )}
      {removed.notice === "removed" && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Removed. The header is showing the board&rsquo;s name again.
        </p>
      )}

      <div
        className={`flex min-h-16 items-center justify-center rounded-md border border-border bg-card p-3 ${
          slot.scheme === "dark" ? "dark" : ""
        }`}
      >
        {slot.src === null ? (
          <span className="text-xs text-muted-foreground">
            Nothing uploaded — the header shows the board&rsquo;s name.
          </span>
        ) : (
          <img src={slot.src} alt="" className="h-8 w-auto max-w-48 object-contain" />
        )}
      </div>

      <form action={saveAction} className="flex flex-col gap-2">
        <input type="hidden" name="scheme" value={slot.scheme} />
        <label htmlFor={id} className="sr-only">
          {slot.label}
        </label>
        <input
          id={id}
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          required
          className="w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPEG, WebP or SVG, up to {maxKib} KiB. The contents decide the
          format, not the file name. An SVG containing script is refused.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-32">
            <SubmitButton>Upload</SubmitButton>
          </span>
        </div>
      </form>

      {slot.src !== null && (
        <form action={removeAction}>
          <input type="hidden" name="scheme" value={slot.scheme} />
          <button type="submit" className={GHOST}>
            Remove
          </button>
        </form>
      )}
    </div>
  )
}
