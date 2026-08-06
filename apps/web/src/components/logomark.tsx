/**
 * The mark: a board, reduced to a panel and two threads in it.
 *
 * What it replaces was four irregular fields with a stone wall between them —
 * a townland seen from above, one quadrant lit gorse-yellow. It was drawn from
 * the same idea as the rest of that identity, and it had the same problem: at
 * 16px in a browser tab it was four grey shapes, and at any size it said
 * "landscape" to an audience deciding whether to run a server.
 *
 * This one is legible at favicon size, which is the only real constraint on a
 * mark, and it says what the software is without a word. Solid accent with the
 * threads knocked out of it rather than an outline: an outlined glyph at 16px
 * loses its interior, and the filled version is also the one spot of colour the
 * header gets.
 *
 * Drawn from the tokens rather than referencing `public/icon.svg`, so it is
 * correct in both schemes — the file is a static asset frozen in one palette,
 * which is the right trade for a browser tab and the wrong one for a header that
 * follows the page.
 */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      {/*
        Two shapes, one fill. The tail starts *inside* the panel rather than at
        its edge, so the join is invisible and there is no seam to align.
      */}
      <g className="fill-accent">
        <rect x="2" y="3" width="28" height="20" rx="6" />
        <path d="M10 19 L8.4 28.6 L16.6 22.2 Z" />
      </g>
      <g className="fill-accent-contrast">
        <rect x="8" y="9" width="16" height="2.8" rx="1.4" />
        <rect x="8" y="14.4" width="10" height="2.8" rx="1.4" />
      </g>
    </svg>
  )
}
