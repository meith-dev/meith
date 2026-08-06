"use client"

/**
 * F58 — the avatar controls.
 *
 * Two independent forms rather than one with two buttons, because "replace" and
 * "remove" are different verbs with different confirmations and different
 * failure messages, and a single action that branched on which button was
 * pressed would have to reconstruct that.
 *
 * A locked avatar renders neither: it renders the moderator's reason. That
 * mirrors the signature screen exactly, and for the reason D61 gives — "your
 * avatar has been locked" with nothing else is how somebody concludes the board
 * is broken rather than that they broke a rule.
 */
import { useActionState } from "react"

/*
 * The leaf module, not the package barrel. This file runs in the browser and
 * the barrel reaches `@meith/core` -> `node:async_hooks`. See `limits.ts`.
 */
import { AVATAR_BOX, AVATAR_MAX_BYTES } from "@meith/avatars/limits"

import { removeAvatarAction, saveAvatarAction } from "@/server/usercp-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"

const CARD = "flex flex-col gap-3 rounded-lg border border-border bg-card p-4"

export function AvatarForm({
  currentUrl,
  status,
  failureReason,
  locked,
  lockedReason,
}: {
  currentUrl: string | null
  status: "none" | "pending" | "ready" | "failed"
  failureReason: string | null
  locked: boolean
  lockedReason: string | null
}) {
  const [saveState, save] = useActionState(saveAvatarAction, EMPTY_STATE)
  const [removeState, remove] = useActionState(removeAvatarAction, EMPTY_STATE)

  if (locked) {
    return (
      <div className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">Your avatar is locked</h2>
        <p className="text-sm text-muted-foreground">
          A moderator has stopped your avatar from being shown or changed.
          {lockedReason === null ? null : (
            <>
              {" "}
              Reason given: <span className="text-foreground">{lockedReason}</span>
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">Your avatar</h2>

        {status === "pending" && (
          <p className="text-sm text-muted-foreground">
            Your new avatar is being processed. It will appear shortly — the image
            is re-encoded before the board will show it, which is what keeps an
            upload from carrying anything but pixels.
          </p>
        )}
        {status === "failed" && (
          <p className="text-sm text-muted-foreground">
            {failureReason ?? "That image could not be processed."}
          </p>
        )}

        {currentUrl === null ? (
          <p className="text-sm text-muted-foreground">You have not set one.</p>
        ) : (
          <img
            src={currentUrl}
            alt="Your avatar"
            width={AVATAR_BOX.width}
            height={AVATAR_BOX.height}
            className="h-24 w-24 rounded-md border border-border object-cover"
          />
        )}
      </div>

      <form action={save} className={CARD} noValidate>
        <FormError message={saveState.error} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Choose an image</span>
          <input
            type="file"
            name="avatar"
            accept=".png,.jpg,.jpeg"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
          />
          <span className="text-xs text-muted-foreground">
            PNG or JPEG, up to {Math.round(AVATAR_MAX_BYTES / (1024 * 1024))} MB. It
            is scaled to fit {AVATAR_BOX.width}×{AVATAR_BOX.height} and re-encoded,
            which removes any metadata it carries — including where the photograph
            was taken.
          </span>
        </label>
        <div>
          <SubmitButton>Upload</SubmitButton>
        </div>
      </form>

      {currentUrl !== null && (
        <form action={remove} className={CARD} noValidate>
          <FormError message={removeState.error} />
          <p className="text-sm text-muted-foreground">
            Removing it takes the image down everywhere it appears.
          </p>
          <div>
            <SubmitButton>Remove my avatar</SubmitButton>
          </div>
        </form>
      )}
    </div>
  )
}
