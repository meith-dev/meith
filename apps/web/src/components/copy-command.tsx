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
      className="inline-flex cursor-copy items-center gap-3 rounded-sm border border-wall bg-ground-deep px-4 py-3 font-mono text-base text-ink transition-colors hover:border-gorse"
    >
      <span aria-hidden className="text-gorse">
        $
      </span>
      <span>{command}</span>
      <span aria-live="polite" className="font-mono text-micro tracking-[0.1em] text-ink-faint uppercase">
        {state === "copied" ? "copied" : state === "manual" ? "press ⌘C" : ""}
      </span>
    </button>
  )
}
