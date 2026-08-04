'use client'

/**
 * F42's file input, shared by both composers.
 *
 * Deliberately plain: a native `<input type="file" multiple>` and a line saying
 * what the board will take. The files are submitted **with the post**, in one
 * request, which is what makes attaching work with JavaScript off — there is no
 * upload step, no draft token, and nothing to lose if the browser cannot run a
 * script.
 *
 * The honest cost, and it is a real one: a browser cannot repopulate a file
 * input, so a submission that fails validation for any reason loses the chosen
 * files even though the message survives. That is true of every no-JS upload
 * and it is why the *message* is the thing carefully preserved. F45's islands
 * are where an incremental upload would go.
 */
/*
 * The leaf modules, not the package barrel. This file runs in the browser, and
 * the barrel reaches `service.ts` -> `@meith/core` -> `node:async_hooks`, which
 * is a build error rather than a slow page. See `limits.ts`.
 */
import { ACCEPTED_EXTENSIONS, ATTACHMENT_FIELD } from '@meith/attachments/types'
import { maxBytesFor, maxPerPostFor, type UploadLimits } from '@meith/attachments/limits'
import { useRef } from 'react'

import { formatBytes } from '@/view/attachments'

export function AttachmentField({ limits }: { limits: UploadLimits }) {
  const input = useRef<HTMLInputElement>(null)
  const perPost = maxPerPostFor(limits)
  const maxBytes = maxBytesFor(limits)

  return (
    <label
      className="flex flex-col gap-1 text-sm"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        if (input.current === null) return
        const files = new DataTransfer()
        for (const file of event.dataTransfer.files) files.items.add(file)
        input.current.files = files.files
      }}
    >
      <span className="font-medium">Attachments</span>
      <input
        ref={input}
        type="file"
        name={ATTACHMENT_FIELD}
        multiple
        /*
         * A hint to the file picker, not a check. Every rule that matters is
         * applied to the *bytes* on the server — `accept` filters by extension,
         * which is the one thing the board deliberately does not trust.
         */
        accept={ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
      />
      <span className="text-xs text-muted-foreground">Drop files here to attach them.</span>
      <span className="text-xs text-muted-foreground">
        Up to {perPost} file{perPost === 1 ? '' : 's'}, {formatBytes(maxBytes)} each.
        PNG, JPEG, PDF or ZIP. Images are re-encoded, which removes any metadata
        they carry.
      </span>
    </label>
  )
}
