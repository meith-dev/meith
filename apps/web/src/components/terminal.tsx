import { terminal } from "../content/site"

/**
 * The install, in a window.
 *
 * This is the illustration the old page did not have. There was a transcript
 * once — it sat above the measurements, showing the installer's five steps — and
 * it was cut for answering a question the reader had not reached yet. It comes
 * back here, in the band about where the software runs, which is exactly where
 * somebody wants to know what running it looks like.
 *
 * `<div>`s rather than a `<pre>`: `pre`'s content model is phrasing content, so
 * a block element inside one is invalid markup that browsers merely tolerate.
 * `.terminal-line` sets `white-space: pre`, which is the part that was wanted.
 */
export function Terminal({ className }: { className?: string }) {
  return (
    <div className={`terminal ${className ?? ""}`}>
      <div className="terminal-bar">
        <span aria-hidden>▸</span>
        <span>{terminal.cwd}</span>
      </div>
      {/*
        The `$` prompts are drawn by CSS and marked `user-select: none`, so
        dragging across three lines and copying them yields three commands
        rather than three commands with a shell prompt glued to the front.
      */}
      <div className="terminal-body">
        {terminal.lines.map((line) => (
          <div key={line.text} className="terminal-line" data-out={line.output ? "" : undefined}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}
