import { boardPreview } from "../content/site"
import { group } from "../format"

/**
 * A drawing of a board, beside the headline.
 *
 * The site had no picture of the thing it sells. That is a real omission on a
 * page for forum software: "forum" is a word people have twenty years of
 * different pictures for, and the half-second it takes to recognise one is worth
 * more than the paragraph underneath.
 *
 * A drawing rather than a screenshot, for two reasons. A screenshot of a board
 * is a screenshot of somebody's *theme*, and this one would be stale the first
 * time the default changed. And a screenshot needs a real community's threads in
 * it, or invented ones dressed up as real — the caption says outright that this
 * is an outline, and the content is generic enough to be obviously so.
 *
 * Built from the tokens rather than as an image: it is correct in both schemes,
 * it costs no request, and it stays sharp at any density.
 */
export function BoardPreview() {
  const { caption, name, blurb, forums, latest } = boardPreview

  return (
    <figure className="flex flex-col gap-3">
      {/*
        `aria-hidden` on the drawing itself, and the caption left readable. A
        screen reader gains nothing from three invented forum names and a
        thread count; it gains the sentence that says what the picture is.
      */}
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
