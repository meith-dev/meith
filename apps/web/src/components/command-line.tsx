'use client'

import { useEffect, useRef, useState } from 'react'

export function CommandLine({
  command,
  className,
}: {
  readonly command: string
  readonly className?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className={className === undefined ? 'command' : `command ${className}`}>
      <code className="command-text">
        <span aria-hidden className="command-prompt">
          $
        </span>
        {command}
      </code>
      <button
        aria-label={state === 'copied' ? 'Copied' : 'Copy command'}
        className="command-copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command)
            setState('copied')
          } catch {
            setState('failed')
          }
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setState('idle'), 2000)
        }}
        type="button"
      >
        {state === 'copied' ? 'copied' : state === 'failed' ? '⌘C' : 'copy'}
      </button>
    </div>
  )
}
