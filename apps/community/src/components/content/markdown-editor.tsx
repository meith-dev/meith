"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"

import { cn } from "@meith/ui"

import { renderPreviewAction, type PreviewScope } from "@/server/content-actions"

import {
  fenceEdit,
  linkEdit,
  listContinuation,
  pasteAsLink,
  toggleWrap,
  togglePrefix,
  type Edit,
  type LineMarker,
  type WrapSyntax,
} from "./markdown-syntax"

type Command =
  | { readonly kind: "wrap"; readonly syntax: WrapSyntax }
  | { readonly kind: "prefix"; readonly marker: LineMarker }
  | { readonly kind: "link" }
  | { readonly kind: "fence" }

interface Tool {
  readonly label: string
  readonly glyph: string
  readonly shortcut?: string
  readonly command: Command
}

const TOOLS: readonly Tool[] = [
  {
    label: "Bold",
    glyph: "B",
    shortcut: "b",
    command: { kind: "wrap", syntax: { marker: "*", length: 2, placeholder: "bold text" } },
  },
  {
    label: "Italic",
    glyph: "I",
    shortcut: "i",
    command: { kind: "wrap", syntax: { marker: "*", length: 1, placeholder: "italic text" } },
  },
  {
    label: "Strikethrough",
    glyph: "S",
    command: { kind: "wrap", syntax: { marker: "~", length: 2, placeholder: "struck out" } },
  },
  { label: "Link", glyph: "Link", shortcut: "k", command: { kind: "link" } },
  { label: "Quote", glyph: "“”", command: { kind: "prefix", marker: "> " } },
  { label: "Code", glyph: "</>", command: { kind: "fence" } },
  { label: "Bulleted list", glyph: "•", command: { kind: "prefix", marker: "- " } },
  {
    label: "Numbered list",
    glyph: "1.",
    command: { kind: "prefix", marker: (index: number) => `${index + 1}. ` },
  },
  { label: "Heading", glyph: "H", command: { kind: "prefix", marker: "## " } },
]

function apply(field: HTMLTextAreaElement, edit: Edit): void {
  field.setRangeText(edit.text, edit.from, edit.to, "end")
  field.setSelectionRange(edit.selectionStart, edit.selectionEnd)
  field.focus()
  field.dispatchEvent(new Event("input", { bubbles: true }))
}

function run(field: HTMLTextAreaElement, command: Command): void {
  const { value, selectionStart: start, selectionEnd: end } = field

  if (command.kind === "wrap") apply(field, toggleWrap(value, start, end, command.syntax))
  else if (command.kind === "prefix") apply(field, togglePrefix(value, start, end, command.marker))
  else if (command.kind === "link") apply(field, linkEdit(value, start, end))
  else apply(field, fenceEdit(value, start, end))
}

export interface MarkdownEditorProps {
  readonly id?: string | undefined
  readonly name?: string | undefined
  readonly label?: string | undefined
  readonly rows?: number | undefined
  readonly required?: boolean | undefined
  readonly defaultValue?: string | undefined
  readonly maxLength?: number | undefined
  readonly preview?: string | undefined
  readonly hint?: React.ReactNode
  readonly scope?: PreviewScope
}

export function MarkdownEditor({
  id = "post-message",
  name = "message",
  label = "Message",
  rows = 12,
  required = false,
  defaultValue,
  maxLength,
  preview,
  hint,
  scope = "post",
}: MarkdownEditorProps) {
  const field = useRef<HTMLTextAreaElement>(null)
  const panelId = useId()

  const [enhanced, setEnhanced] = useState(false)
  useEffect(() => setEnhanced(true), [])

  const [tab, setTab] = useState<"write" | "preview">(preview === undefined ? "write" : "preview")
  const [rendered, setRendered] = useState<string | null>(preview ?? null)
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "failed">("idle")

  const fit = useCallback(() => {
    const element = field.current
    if (element === null) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (enhanced) fit()
  }, [enhanced, fit])

  useEffect(() => {
    if (preview === undefined) return
    setRendered(preview)
    setTab("preview")
  }, [preview])

  async function showPreview(): Promise<void> {
    setTab("preview")
    const source = field.current?.value ?? ""
    setPreviewState("loading")
    try {
      setRendered(await renderPreviewAction(source, scope))
      setPreviewState("idle")
    } catch {
      setPreviewState("failed")
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    const element = event.currentTarget

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      element.form?.requestSubmit()
      event.preventDefault()
      return
    }

    if (event.metaKey || event.ctrlKey) {
      const tool = TOOLS.find((candidate) => candidate.shortcut === event.key.toLowerCase())
      if (tool !== undefined) {
        event.preventDefault()
        run(element, tool.command)
      }
      return
    }

    if (event.key !== "Enter" || event.shiftKey) return

    const edit = listContinuation(element.value, element.selectionStart)
    if (edit === null) return

    event.preventDefault()
    apply(element, edit)
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const element = event.currentTarget
    const edit = pasteAsLink(
      element.value,
      element.selectionStart,
      element.selectionEnd,
      event.clipboardData.getData("text/plain"),
    )
    if (edit === null) return

    event.preventDefault()
    apply(element, edit)
  }

  function onTabKey(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    if (tab === "write") void showPreview()
    else setTab("write")
  }

  const writing = !enhanced || tab === "write"

  const tabClass = (active: boolean): string =>
    cn(
      "rounded-t-md border border-b-0 px-3 py-1.5 text-sm font-medium",
      active
        ? "border-border bg-card text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    )

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>

        {enhanced && (
          <div role="tablist" aria-label="Write or preview" className="flex gap-1" onKeyDown={onTabKey}>
            <button
              type="button"
              role="tab"
              id={`${panelId}-write-tab`}
              aria-selected={tab === "write"}
              aria-controls={`${panelId}-write`}
              tabIndex={tab === "write" ? 0 : -1}
              onClick={() => setTab("write")}
              className={tabClass(tab === "write")}
            >
              Write
            </button>
            <button
              type="button"
              role="tab"
              id={`${panelId}-preview-tab`}
              aria-selected={tab === "preview"}
              aria-controls={`${panelId}-preview`}
              tabIndex={tab === "preview" ? 0 : -1}
              onClick={() => void showPreview()}
              className={tabClass(tab === "preview")}
            >
              Preview
            </button>
          </div>
        )}
      </div>

      {enhanced && tab === "write" && (
        <div
          role="group"
          aria-label="Formatting"
          aria-controls={id}
          className="flex flex-wrap gap-0.5 rounded-md border border-border bg-muted/40 p-1"
        >
          {TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (field.current !== null) run(field.current, tool.command)
              }}
              title={
                tool.shortcut === undefined
                  ? tool.label
                  : `${tool.label} (Ctrl+${tool.shortcut.toUpperCase()})`
              }
              aria-label={tool.label}
              {...(tool.shortcut === undefined ? {} : { "aria-keyshortcuts": `Control+${tool.shortcut}` })}
              className="min-w-8 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span aria-hidden="true">{tool.glyph}</span>
            </button>
          ))}
        </div>
      )}

      <div
        {...(enhanced ? { role: "tabpanel", id: `${panelId}-write`, "aria-labelledby": `${panelId}-write-tab` } : {})}
        hidden={!writing}
      >
        <textarea
          ref={field}
          id={id}
          name={name}
          rows={rows}
          required={required === true && writing}
          defaultValue={defaultValue}
          {...(maxLength === undefined ? {} : { maxLength })}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onInput={fit}
          className="w-full rounded-md border border-input bg-card px-3 py-2 font-normal text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      {enhanced && tab === "preview" && (
        <div
          role="tabpanel"
          id={`${panelId}-preview`}
          aria-labelledby={`${panelId}-preview-tab`}
          aria-live="polite"
          className="min-h-32 rounded-md border border-border bg-card px-3 py-2"
        >
          {previewState === "loading" && <p className="text-sm text-muted-foreground">Rendering…</p>}
          {previewState === "failed" && (
            <p className="text-sm text-destructive">
              The preview could not be rendered. Your post is untouched — switch back to Write.
            </p>
          )}
          {previewState === "idle" &&
            (rendered === null || rendered === "" ? (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            ) : (
              <div className="prose-md text-sm" dangerouslySetInnerHTML={{ __html: rendered }} />
            ))}
        </div>
      )}

      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
      <FormattingHelp scope={scope} />
    </div>
  )
}

function FormattingHelp({ scope }: { scope: PreviewScope }) {
  const inline: readonly (readonly [string, string])[] = [
    ["**bold**", "bold"],
    ["*italic*", "italic"],
    ["~~struck~~", "struck out"],
    ["[text](https://…)", "a link"],
    ["`code`", "code, inline"],
  ]
  const blocks: readonly (readonly [string, string])[] = [
    ["```", "a code block, closed by another ```"],
    ["> quoted", "a quote"],
    ["- item", "a list; 1. for a numbered one"],
    ["## Heading", "a heading"],
  ]
  const rows = scope === "signature" ? inline : [...inline, ...blocks]

  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">Formatting help</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([syntax, meaning]) => (
          <div key={syntax} className="contents">
            <dt>
              <code>{syntax}</code>
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2">
        A single Return is a line break, exactly as you typed it. HTML is shown as text, never
        rendered.
      </p>
    </details>
  )
}
