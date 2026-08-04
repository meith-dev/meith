"use client"

/**
 * The composer (F45).
 *
 * ## The textarea is the feature; everything else is enhancement
 *
 * This board posts with JavaScript off (R5), so the editor cannot *be* the
 * editor — it has to be a plain `<textarea>` that something helpful is wrapped
 * around. That single constraint settles the question every forum re-asks:
 *
 *   - **Not a WYSIWYG.** A ProseMirror or Lexical surface replaces the
 *     textarea, which means with scripting off the board has no composer at
 *     all. It also stores a second representation of a post — and every board
 *     that has shipped one has ended up with two renderers that disagree, and
 *     with members who cannot fix a mangled quote because there is no source to
 *     look at.
 *   - **Not a side-by-side live preview.** It doubles the width of the writing
 *     surface on a phone, and it re-renders on every keystroke — which is
 *     either a second parser shipped to the browser (drift) or a request per
 *     keystroke (cost). Write and Preview as tabs is what GitHub, Discourse and
 *     Stack Overflow all converged on, and the reason is the same in each: the
 *     preview is checked a few times per post, not continuously.
 *   - **Not a toolbar that is always there.** The toolbar and the tabs are
 *     rendered *after mount*, so a reader with scripting off is never shown
 *     buttons that do nothing. That is why `enhanced` exists rather than being
 *     assumed.
 *
 * What is left is a textarea that knows Markdown: shortcuts, selection-aware
 * wrapping, list continuation on Return, and a link built from a pasted URL.
 * Every one of them is something the member could have typed by hand, which is
 * the test for whether it belongs here at all.
 *
 * ## The preview is the *renderer*, not an impression of it
 *
 * `renderPreviewAction` is a Server Action that calls the same function the
 * thread page calls, with the same board vocabulary. It costs a round trip and
 * that is the price of the guarantee: what the preview shows is what the thread
 * will show, permanently, rather than until somebody fixes one of two parsers.
 *
 * With scripting off the tabs are absent and the form's own `intent=preview`
 * submit still works — the same render, reached by a page load.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"

import { cn } from "@meith/ui"

import { renderPreviewAction, type PreviewScope } from "@/server/content-actions"

/** What a toolbar button does to the text. */
type Command =
  /** Wrap the selection: `**bold**`. Pressing it again unwraps. */
  | { readonly kind: "wrap"; readonly before: string; readonly after: string; readonly placeholder: string }
  /** Prefix every selected line: `> `, `- `, `## `. Pressing it again strips. */
  | { readonly kind: "prefix"; readonly marker: string | ((index: number) => string) }
  /** A link, built around whatever is selected. */
  | { readonly kind: "link" }
  /** A fenced block, on its own lines. */
  | { readonly kind: "fence" }

interface Tool {
  readonly label: string
  readonly hint: string
  /** Drawn as text, not an icon font: the glyph *is* the syntax it inserts. */
  readonly glyph: string
  readonly shortcut?: string
  readonly command: Command
}

const TOOLS: readonly Tool[] = [
  {
    label: "Bold",
    hint: "Bold",
    glyph: "B",
    shortcut: "b",
    command: { kind: "wrap", before: "**", after: "**", placeholder: "bold text" },
  },
  {
    label: "Italic",
    hint: "Italic",
    glyph: "I",
    shortcut: "i",
    /*
     * `_` rather than `*`, so that pressing Bold and then Italic on the same
     * words produces `**_x_**` instead of a run of five asterisks nobody can
     * count — the single most common way a Markdown toolbar produces output its
     * own parser reads wrongly.
     */
    command: { kind: "wrap", before: "_", after: "_", placeholder: "italic text" },
  },
  {
    label: "Strikethrough",
    hint: "Strikethrough",
    glyph: "S",
    command: { kind: "wrap", before: "~~", after: "~~", placeholder: "struck out" },
  },
  {
    label: "Link",
    hint: "Link",
    glyph: "Link",
    shortcut: "k",
    command: { kind: "link" },
  },
  {
    label: "Quote",
    hint: "Quote",
    glyph: "“”",
    command: { kind: "prefix", marker: "> " },
  },
  {
    label: "Code",
    hint: "Code block",
    glyph: "</>",
    command: { kind: "fence" },
  },
  {
    label: "Bulleted list",
    hint: "Bulleted list",
    glyph: "•",
    command: { kind: "prefix", marker: "- " },
  },
  {
    label: "Numbered list",
    hint: "Numbered list",
    glyph: "1.",
    command: { kind: "prefix", marker: (index: number) => `${index + 1}. ` },
  },
  {
    label: "Heading",
    hint: "Heading",
    glyph: "H",
    command: { kind: "prefix", marker: "## " },
  },
]

/** A list marker at the start of a line, for Return-continues-the-list. */
const CONTINUES = /^(\s*)(?:([-*+])\s+(?:\[[ xX]\]\s+)?|(\d{1,9})([.)])\s+|(>)\s?)/

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i

interface Selection {
  readonly start: number
  readonly end: number
  readonly value: string
}

/** Replace `[start, end)` and leave the caret where the caller asks. */
function splice(
  field: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  select: { readonly start: number; readonly end: number },
): void {
  /*
   * `setRangeText` rather than assigning `.value`, because it is what keeps the
   * browser's own undo stack intact — a toolbar that broke Ctrl-Z would be
   * worse than no toolbar.
   */
  field.setRangeText(text, start, end, "end")
  field.setSelectionRange(select.start, select.end)
  field.focus()
  field.dispatchEvent(new Event("input", { bubbles: true }))
}

/** The line range containing `[start, end)`. */
function lineRange(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf("\n", start - 1) + 1
  const lineEnd = value.indexOf("\n", end)
  return { from, to: lineEnd === -1 ? value.length : lineEnd }
}

function applyWrap(field: HTMLTextAreaElement, selection: Selection, command: Extract<Command, { kind: "wrap" }>): void {
  const { start, end, value } = selection
  const selected = value.slice(start, end)

  /* Already wrapped? Then the button is an off switch. */
  const before = value.slice(Math.max(0, start - command.before.length), start)
  const after = value.slice(end, end + command.after.length)
  if (before === command.before && after === command.after) {
    splice(field, start - command.before.length, end + command.after.length, selected, {
      start: start - command.before.length,
      end: end - command.before.length,
    })
    return
  }

  const body = selected === "" ? command.placeholder : selected
  splice(field, start, end, `${command.before}${body}${command.after}`, {
    start: start + command.before.length,
    end: start + command.before.length + body.length,
  })
}

function applyPrefix(
  field: HTMLTextAreaElement,
  selection: Selection,
  command: Extract<Command, { kind: "prefix" }>,
): void {
  const { from, to } = lineRange(selection.value, selection.start, selection.end)
  const lines = selection.value.slice(from, to).split("\n")
  const markerFor = (index: number): string =>
    typeof command.marker === "string" ? command.marker : command.marker(index)

  /* Every line already marked means the button removes it. */
  const marked = lines.every((line, index) => line.startsWith(markerFor(index)))
  const next = lines
    .map((line, index) => (marked ? line.slice(markerFor(index).length) : `${markerFor(index)}${line}`))
    .join("\n")

  splice(field, from, to, next, { start: from, end: from + next.length })
}

function applyLink(field: HTMLTextAreaElement, selection: Selection): void {
  const { start, end, value } = selection
  const selected = value.slice(start, end)

  /* A selected URL becomes the destination; selected words become the label. */
  if (URL_ONLY.test(selected)) {
    const text = "link text"
    splice(field, start, end, `[${text}](${selected})`, { start: start + 1, end: start + 1 + text.length })
    return
  }

  const text = selected === "" ? "link text" : selected
  const inserted = `[${text}](url)`
  splice(field, start, end, inserted, {
    start: start + text.length + 3,
    end: start + text.length + 6,
  })
}

function applyFence(field: HTMLTextAreaElement, selection: Selection): void {
  const { from, to } = lineRange(selection.value, selection.start, selection.end)
  const body = selection.value.slice(from, to)
  const lead = from === 0 ? "" : "\n"
  const inserted = `${lead}\`\`\`\n${body === "" ? "code" : body}\n\`\`\``
  splice(field, from, to, inserted, {
    start: from + lead.length + 4,
    end: from + lead.length + 4 + (body === "" ? 4 : body.length),
  })
}

function run(field: HTMLTextAreaElement, command: Command): void {
  const selection: Selection = {
    start: field.selectionStart,
    end: field.selectionEnd,
    value: field.value,
  }
  if (command.kind === "wrap") applyWrap(field, selection, command)
  else if (command.kind === "prefix") applyPrefix(field, selection, command)
  else if (command.kind === "link") applyLink(field, selection)
  else applyFence(field, selection)
}

export interface MarkdownEditorProps {
  /** The textarea's id. The form's `<label>` points at it. */
  readonly id?: string | undefined
  readonly name?: string | undefined
  readonly label?: string | undefined
  readonly rows?: number | undefined
  readonly required?: boolean | undefined
  readonly defaultValue?: string | undefined
  readonly maxLength?: number | undefined
  /**
   * The server-rendered preview from a no-JS `intent=preview` submit.
   *
   * Shown in the Preview tab when there is one and the member has not asked for
   * a fresh render, so a page that came back from a preview submit opens on the
   * preview rather than making them press it twice.
   */
  readonly preview?: string | undefined
  /** Extra note under the box. The formatting help is always there. */
  readonly hint?: React.ReactNode
  /**
   * Which set of constructs this box may use.
   *
   * Reaches two places, and both would otherwise lie: the cheat sheet lists
   * only what will work, and the preview is rendered with the same narrowed
   * parser the save will use (F58).
   */
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

  /*
   * False until mounted, which is the whole no-JS story: the toolbar and the
   * tabs are never in the server-rendered HTML, so a member with scripting off
   * sees a labelled textarea and the form's own Preview button, and nothing
   * that looks pressable and is not.
   */
  const [enhanced, setEnhanced] = useState(false)
  useEffect(() => setEnhanced(true), [])

  const [tab, setTab] = useState<"write" | "preview">(preview === undefined ? "write" : "preview")
  const [rendered, setRendered] = useState<string | null>(preview ?? null)
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "failed">("idle")

  /** Grow to fit, so a long post is not written through a six-line window. */
  const fit = useCallback(() => {
    const element = field.current
    if (element === null) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (enhanced) fit()
  }, [enhanced, fit])

  /*
   * A preview that arrived from the form's own submit opens the Preview tab.
   * Without this, pressing the no-JS Preview button *with* scripting on would
   * render a preview the component never showed — the state came back, the tab
   * stayed on Write, and nothing appeared to happen.
   */
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
      /*
       * A failed preview must never cost somebody their post, so this reports
       * and stops. The text is untouched and the Write tab is one click away.
       */
      setPreviewState("failed")
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    const element = event.currentTarget

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      /* The form's *first* submit button, which every composer orders as the one that posts. */
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

    /*
     * Return continues a list. On an item with nothing in it, Return *ends* the
     * list instead — which is the behaviour every editor that does this has
     * settled on, and the reason the feature is not infuriating.
     */
    const { from } = lineRange(element.value, element.selectionStart, element.selectionStart)
    const line = element.value.slice(from, element.selectionStart)
    const match = CONTINUES.exec(line)
    if (match === null) return

    const marker = match[0]
    if (line.length === marker.length) {
      event.preventDefault()
      splice(element, from, element.selectionStart, "", { start: from, end: from })
      return
    }

    const indent = match[1] ?? ""
    const ordered = match[3]
    const next =
      ordered === undefined
        ? marker
        : `${indent}${Number(ordered) + 1}${match[4] ?? "."} `

    event.preventDefault()
    splice(element, element.selectionStart, element.selectionEnd, `\n${next}`, {
      start: element.selectionStart + next.length + 1,
      end: element.selectionStart + next.length + 1,
    })
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const element = event.currentTarget
    const pasted = event.clipboardData.getData("text/plain")
    if (!URL_ONLY.test(pasted.trim())) return
    if (element.selectionStart === element.selectionEnd) return

    /* A URL pasted over selected words is a link around those words. */
    event.preventDefault()
    const start = element.selectionStart
    const text = element.value.slice(start, element.selectionEnd)
    splice(element, start, element.selectionEnd, `[${text}](${pasted.trim()})`, {
      start: start + text.length + 3 + pasted.trim().length,
      end: start + text.length + 3 + pasted.trim().length,
    })
  }

  function onTabKey(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    if (tab === "write") void showPreview()
    else setTab("write")
  }

  /* One expression, used by the panel's `hidden` and the textarea's `required`. */
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
        /*
          `role="group"`, not `role="toolbar"`. A toolbar promises roving focus —
          one tab stop, arrow keys between the buttons — and a control that
          claims the role without implementing it is worse for a screen-reader
          user than one that never claimed it. Nine ordinary buttons in a
          labelled group is what this is.
        */
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
              /*
               * The work is in `onClick`, so the keyboard reaches it: a button
               * activated with Enter or Space fires click and never fires
               * mousedown. `onMouseDown` exists only to stop the *pointer* from
               * moving focus, which on some browsers collapses the textarea's
               * selection before the handler can read it — so Bold would wrap
               * nothing. Preventing mousedown's default does not cancel the
               * click, so each press still runs the command exactly once.
               */
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (field.current !== null) run(field.current, tool.command)
              }}
              title={tool.shortcut === undefined ? tool.hint : `${tool.hint} (Ctrl+${tool.shortcut.toUpperCase()})`}
              aria-label={tool.label}
              {...(tool.shortcut === undefined ? {} : { "aria-keyshortcuts": `Control+${tool.shortcut}` })}
              className="min-w-8 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span aria-hidden="true">{tool.glyph}</span>
            </button>
          ))}
        </div>
      )}

      {/*
        The textarea is never unmounted — only hidden — because it carries the
        member's post. Unmounting it on the Preview tab would drop the value out
        of the form, and a submit from that tab would post nothing.
      */}
      <div
        {...(enhanced ? { role: "tabpanel", id: `${panelId}-write`, "aria-labelledby": `${panelId}-write-tab` } : {})}
        hidden={!writing}
      >
        <textarea
          ref={field}
          id={id}
          name={name}
          rows={rows}
          /*
           * `required` follows the panel's visibility, because a browser asked
           * to report a validation failure on a hidden control refuses the
           * submit and focuses nothing — so pressing Send from the Preview tab
           * would do nothing at all, with the reason only in the console. The
           * server validates either way, which is the rule everywhere here.
           */
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
              /*
                Trusted HTML: `@meith/markdown`'s own construction, from the same
                function that renders the thread. It is built out of escaped text
                and validated URLs and never parsed from markup — the same
                contract every post body on the board is inserted under.
              */
              <div className="prose-md text-sm" dangerouslySetInnerHTML={{ __html: rendered }} />
            ))}
        </div>
      )}

      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
      <FormattingHelp scope={scope} />
    </div>
  )
}

/**
 * The cheat sheet.
 *
 * A `<details>`, so it is there with scripting off, costs nothing when closed,
 * and does not spend the vertical space above the box that the member came here
 * to type in. Nine lines: what a forum post actually uses.
 */
function FormattingHelp({ scope }: { scope: PreviewScope }) {
  const inline: readonly (readonly [string, string])[] = [
    ["**bold**", "bold"],
    ["_italic_", "italic"],
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
  /* Only what will work here: a cheat sheet listing the rest teaches a mistake. */
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
