import type { Audience } from "../content/site"
import { group } from "../format"

/*
 * A board in outline. It used to hold its own content and show a single
 * developer's board; it now takes whichever community the picker beside it has
 * selected, so the same twenty lines render five of them.
 *
 * The lock is the only thing here doing an argument's work. Every audience
 * carries exactly one private forum, and a reader who sees one understands the
 * permission model without the page having to claim anything about it.
 */
export function BoardPreview({ audience }: { audience: Audience }) {
  const { board, forums, latest } = audience

  return (
    <div aria-hidden className="card overflow-hidden shadow-[var(--lift-lg)]">
      <div className="preview-bar">
        <span className="text-base font-semibold tracking-[-0.015em] text-fg">{board.name}</span>
        <span className="ml-auto font-mono text-[0.66rem] tracking-[0.1em] text-fg-subtle uppercase">
          {board.kind}
        </span>
      </div>

      {forums.map((forum) => (
        <div key={forum.title} className="preview-row">
          <span className="preview-dot">{forum.private ? <LockGlyph /> : "#"}</span>
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-fg">{forum.title}</p>
            <p className="truncate text-micro text-fg-subtle">{forum.blurb}</p>
          </div>
          <p className="text-right font-mono text-[0.66rem] leading-[1.6] text-fg-subtle tabular-nums">
            {group(forum.threads)} threads
            <br />
            {group(forum.posts)} posts
          </p>
        </div>
      ))}

      <div className="preview-foot">
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span className="min-w-0 truncate text-micro text-fg-muted">{latest.thread}</span>
        <span className="ml-auto shrink-0 font-mono text-[0.66rem] text-fg-subtle">
          {latest.when}
        </span>
      </div>
    </div>
  )
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="2.4" y="5.2" width="7.2" height="5.2" rx="1.1" />
      <path d="M4.3 5.2V3.9a1.7 1.7 0 0 1 3.4 0v1.3" strokeLinecap="round" />
    </svg>
  )
}
