'use client'

import { ACCEPTED_EXTENSIONS, ATTACHMENT_FIELD } from '@meith/attachments/types'
import { maxBytesFor, maxPerPostFor, type UploadLimits } from '@meith/attachments/limits'
import { useRef } from 'react'

import { formatBytes } from '@/view/attachments'

export function AttachmentField({ limits }: { limits: UploadLimits }) {
  const input = useRef<HTMLInputElement>(null)
  const perPost = maxPerPostFor(limits)
  const maxBytes = maxBytesFor(limits)

  return (
    <div
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
      <label htmlFor={ATTACHMENT_FIELD} className="font-medium">
        Attachments
      </label>
      <input
        ref={input}
        id={ATTACHMENT_FIELD}
        type="file"
        name={ATTACHMENT_FIELD}
        multiple
        aria-describedby={`${ATTACHMENT_FIELD}-limits`}
        accept={ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
        className="rounded-md border border-input bg-card px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
      />
      <p id={`${ATTACHMENT_FIELD}-limits`} className="text-xs text-muted-foreground">
        Drop files here, or choose up to {perPost} file{perPost === 1 ? '' : 's'} of{' '}
        {formatBytes(maxBytes)} each — PNG, JPEG, PDF or ZIP. Images are re-encoded,
        which removes any metadata they carry.
      </p>
    </div>
  )
}
