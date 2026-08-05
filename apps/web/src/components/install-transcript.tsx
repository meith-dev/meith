import { install } from "../content/site"

/**
 * The five lines that make a board, as a terminal.
 *
 * The same five as `README.md` and the quickstart, from the same string in
 * `site.ts` — the install command already had four copies once and this page is
 * not going to add a fifth.
 *
 * Not a `<pre>` full of markup: the prompt and the trailing comments are drawn,
 * so neither lands in what a reader copies out of the page. `user-select: none`
 * on the prompt does the same job for a selection dragged across it.
 */
export function InstallTranscript() {
  return (
    <div className="terminal panel">
      <div className="terminal-bar">
        <span aria-hidden className="terminal-dot" />
        <span aria-hidden className="terminal-dot" />
        <span aria-hidden className="terminal-dot" />
        <span className="ml-2 font-mono text-[0.66rem] tracking-[0.14em] text-ink-faint uppercase">
          your terminal
        </span>
      </div>

      <div className="terminal-body">
        {install.transcript.map((line) => {
          const hash = line.indexOf("#")
          const command = hash === -1 ? line : line.slice(0, hash).trimEnd()
          const comment = hash === -1 ? null : line.slice(hash)
          return (
            <div key={line}>
              <b aria-hidden>$ </b>
              {command}
              {comment === null ? null : <i> {comment}</i>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
