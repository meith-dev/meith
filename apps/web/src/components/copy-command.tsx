"use client"

import { useEffect, useRef, useState } from "react"

interface CopyCommandProps {
  readonly command: string
}

export function CopyCommand({ command }: CopyCommandProps) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setState("copied")
    } catch {
      setState("manual")
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy: ${command}`}
      className="inline-flex max-w-full cursor-copy items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2.5 font-mono text-micro text-fg transition-colors hover:border-border-strong"
    >
      <span aria-hidden className="text-accent">
        $
      </span>
      <span className="min-w-0 break-all text-left">{command}</span>
      <span
        aria-live="polite"
        className="font-mono text-[0.68rem] tracking-[0.08em] text-fg-subtle uppercase"
      >
        {state === "copied" ? "copied" : state === "manual" ? "press ⌘C" : ""}
      </span>
    </button>
  )
}
