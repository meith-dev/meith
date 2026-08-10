import { boardPreview } from "../content/site"
import { group } from "../format"

export function BoardPreview() {
  const { caption, name, blurb, forums, latest } = boardPreview

  return (
    <figure className="flex flex-col gap-3">
      <div aria-hidden className="card overflow-hidden shadow-[var(--lift-lg)]">
        <div className="preview-bar">
          <span className="text-base font-semibold tracking-[-0.015em] text-fg">{name}</span>
          <span className="ml-auto font-mono text-[0.66rem] tracking-[0.1em] text-fg-subtle uppercase">
            {blurb}
          </span>
        </div>

        {forums.map((forum) => (
          <div key={forum.title} className="preview-row">
            <span className="preview-dot">#</span>
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

      <figcaption className="text-micro leading-[1.5] text-fg-subtle text-pretty">
        {caption}
      </figcaption>
    </figure>
  )
}
