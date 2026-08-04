"use client"

/**
 * A copy button on every fenced block.
 *
 * The blocks are rendered as HTML from Markdown, so there is no React element to
 * hang a button on. Rather than parse that HTML back into a component tree —
 * which would mean re-implementing the renderer in the browser — this finds the
 * figures after mount and portals a real React button into each one. The markup
 * stays server-rendered and the button stays a component, with its own state and
 * its own cleanup.
 *
 * It copies `data-code`, the source the renderer put on the `<pre>`, not the
 * element's `textContent`: highlighting wraps every token in a `<span>`, and
 * reading text back out of that is where copied snippets pick up stray
 * whitespace.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

function CopyButton({ code }: { readonly code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <button
      type="button"
      className="doc-code-copy"
      aria-label={state === "copied" ? "Copied" : "Copy code"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code)
          setState("copied")
        } catch {
          setState("failed")
        }
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setState("idle"), 2000)
      }}
    >
      {state === "copied" ? "copied" : state === "failed" ? "⌘C" : "copy"}
    </button>
  )
}

export function CodeCopyButtons() {
  const [blocks, setBlocks] = useState<{ figure: Element; code: string }[]>([])

  useEffect(() => {
    const found: { figure: Element; code: string }[] = []
    for (const figure of document.querySelectorAll(".doc-body .doc-code")) {
      const code = figure.querySelector("pre")?.getAttribute("data-code")
      if (code) found.push({ figure, code })
    }
    setBlocks(found)
  }, [])

  return (
    <>
      {blocks.map(({ figure, code }, index) => createPortal(<CopyButton code={code} />, figure, String(index)))}
    </>
  )
}
