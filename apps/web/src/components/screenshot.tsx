import type { Shot } from "../content/site"

/*
 * A photograph of a real board.
 *
 * Every image on this site is one, captured by `pnpm site:shots` from the demo
 * seed — there is no illustration, no mock-up and no rendered approximation of
 * a board anywhere on it. That is deliberate: the page it replaced argued its
 * visual claims in prose, and "it looks like your community, not like
 * software" is a sentence a reader has no reason to take on trust.
 *
 * `width` and `height` are the capture size and are always passed, so the
 * browser reserves the right box before the bytes arrive and the page does not
 * jump as each one lands.
 */
export function Screenshot({
  shot,
  className,
  priority = false,
}: {
  shot: Shot
  className?: string
  priority?: boolean
}) {
  /*
   * A plain `<img>`, not `next/image`. These are fixed-size PNGs served from
   * this origin, which is all the site's own CSP allows; `next/image` would put
   * a runtime optimiser in front of files that do not change between deploys,
   * and the site uses it nowhere else.
   */
  return (
    <img
      alt={shot.alt}
      className={className === undefined ? "shot" : `shot ${className}`}
      decoding={priority ? "sync" : "async"}
      height={shot.height}
      loading={priority ? "eager" : "lazy"}
      src={shot.file}
      width={shot.width}
    />
  )
}

/*
 * The pair, swapped by the colour scheme the reader is actually in.
 *
 * A light screenshot on a dark page is the tell that the picture was taken
 * somewhere else. Both are in the markup and CSS chooses between them, because
 * the alternative is JavaScript that runs after first paint — and a hero image
 * that changes colour a moment after the page arrives is worse than either one
 * on its own. The three states are the same three `globals.css` handles
 * everywhere: system-light, system-dark, and a reader who has used the toggle.
 */
export function SchemeScreenshot({
  light,
  dark,
  className,
  priority = false,
}: {
  light: Shot
  dark: Shot
  className?: string
  priority?: boolean
}) {
  const shared = className === undefined ? "" : ` ${className}`

  return (
    <>
      <Screenshot className={`shot-light${shared}`} priority={priority} shot={light} />
      <Screenshot className={`shot-dark${shared}`} priority={priority} shot={dark} />
    </>
  )
}
