'use client'

import { useRef, useState } from 'react'

import { maxBytesFor, maxPerPostFor, type UploadLimits } from '@meith/attachments/limits'
import { ACCEPTED_EXTENSIONS, ATTACHMENT_FIELD } from '@meith/attachments/types'
import { cn } from '@meith/ui'

import { formatBytes } from '@/view/attachments'

import { formatFromCopy, fromCopy, useCopy } from '../shell/copy'

interface ChosenFile {
  readonly id: string
  readonly file: File
}

function filesFrom(input: HTMLInputElement | null): readonly File[] {
  return input === null ? [] : Array.from(input.files ?? [])
}

export function AttachmentField({ limits }: { limits: UploadLimits }) {
  const input = useRef<HTMLInputElement>(null)
  const copy = useCopy()
  const perPost = maxPerPostFor(limits)
  const maxBytes = maxBytesFor(limits)

  const [chosen, setChosen] = useState<readonly ChosenFile[]>([])
  const [dragging, setDragging] = useState(false)

  function sync(): void {
    setChosen(filesFrom(input.current).map((file) => ({ id: crypto.randomUUID(), file })))
  }

  function addFiles(added: FileList): void {
    if (input.current === null) return
    const next = new DataTransfer()
    for (const file of filesFrom(input.current)) next.items.add(file)
    for (const file of added) next.items.add(file)
    input.current.files = next.files
    sync()
  }

  function removeChosen(id: string): void {
    if (input.current === null) return
    const next = new DataTransfer()
    for (const entry of chosen) {
      if (entry.id !== id) next.items.add(entry.file)
    }
    input.current.files = next.files
    sync()
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={ATTACHMENT_FIELD} className="font-medium">
        {fromCopy(copy, 'composer.attachments.label')}
      </label>

      <div
        className={cn(
          'flex flex-col gap-2 rounded-md border-2 border-dashed p-3 transition-colors',
          dragging ? 'border-ring bg-muted/50' : 'border-input',
        )}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        <input
          ref={input}
          id={ATTACHMENT_FIELD}
          type="file"
          name={ATTACHMENT_FIELD}
          multiple
          aria-describedby={`${ATTACHMENT_FIELD}-limits`}
          accept={ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
          onChange={sync}
          className="rounded-md border border-input bg-card px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
        />

        {chosen.length > 0 && (
          <ul className="flex flex-col gap-1">
            {chosen.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1 text-xs"
              >
                <span className="min-w-0 truncate">
                  {entry.file.name} · {formatBytes(entry.file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeChosen(entry.id)}
                  aria-label={formatFromCopy(copy, 'composer.attachments.removeChosen', {
                    name: entry.file.name,
                  })}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  {fromCopy(copy, 'composer.attachments.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p id={`${ATTACHMENT_FIELD}-limits`} className="text-xs text-muted-foreground">
        {formatFromCopy(copy, 'composer.attachments.hint', {
          count: perPost,
          size: formatBytes(maxBytes),
        })}
      </p>
    </div>
  )
}
