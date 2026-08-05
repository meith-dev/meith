import { boardSketch } from "../content/site"
import { group } from "../format"
import { FieldMark } from "./field-mark"

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

export function BoardSketch() {
  const { caption, name, blurb, forums, latest } = boardSketch

  return (
    <figure className="flex flex-col gap-3">
      {/*
        `aria-hidden` on the drawing itself, and the caption left readable. A
        screen reader gains nothing from three invented forum names and a
        thread count; it gains the sentence that says what the picture is.
      */}
      <div aria-hidden className="panel overflow-hidden">
        <div className="sketch-bar">
          <span className="font-display text-base font-semibold tracking-[-0.01em] text-ink">
            {name}
          </span>
          <span className="font-mono text-[0.66rem] tracking-[0.14em] text-ink-faint uppercase">
            {blurb}
          </span>
        </div>

        {forums.map((forum) => (
          <div key={forum.title} className="sketch-row">
            <FieldMark className="mt-0.5 h-5 w-5 opacity-80" />
            <div className="min-w-0">
              <p className="truncate text-base text-ink">{forum.title}</p>
              <p className="truncate text-micro text-ink-faint">{forum.blurb}</p>
            </div>
            <p className="text-right font-mono text-[0.66rem] leading-[1.6] text-ink-faint tabular-nums">
              {group(forum.threads)} threads
              <br />
              {group(forum.posts)} posts
            </p>
          </div>
        ))}

        <div className="sketch-foot">
          <span className="mt-[0.3rem] size-1.5 shrink-0 rounded-full bg-gorse" />
          <span className="min-w-0 truncate text-micro text-ink-soft">{latest.thread}</span>
          <span className="ml-auto shrink-0 font-mono text-[0.66rem] text-ink-faint">
            {latest.when}
          </span>
        </div>
      </div>

      <figcaption className="text-micro leading-[1.5] text-ink-faint text-pretty">
        {caption}
      </figcaption>
    </figure>
  )
}
