'use client'

import { type ReactNode, useState } from 'react'

export function PreviewBoundary({ children, message }: { children: ReactNode; message: string }) {
  const [submitted, setSubmitted] = useState(false)
  return (
    <div
      onSubmitCapture={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setSubmitted(true)
      }}
    >
      {submitted && (
        <p role="status" className="border-b border-border bg-muted p-3 text-sm">
          {message}
        </p>
      )}
      {children}
    </div>
  )
}
