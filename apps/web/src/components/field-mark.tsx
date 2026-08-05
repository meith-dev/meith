/**
 * Four fields and the walls between them — the mark, as an element.
 *
 * The same shape as `public/icon.svg`, which is the favicon and cannot be a
 * component. This one exists because the header had no mark at all: the site's
 * whole identity is a townland seen from above, and the one place a visitor
 * looks for a logo was a word in a serif face.
 *
 * Drawn from the tokens rather than referencing the file, so it is correct in
 * both schemes — the icon is a static asset in the light palette, which is the
 * right trade for a browser tab and the wrong one for a header that follows the
 * page's scheme.
 *
 * `lit` puts the gorse in one quadrant, the way the favicon does. It is on for
 * the wordmark and off everywhere else: gorse is the only loud colour here and
 * repeating it down a list of rows would spend it.
 */
export function FieldMark({ className, lit = false }: { className?: string; lit?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M2 2 L15 3 L14 15 L3 14 Z" className="fill-field-a" />
      <path
        d="M15 3 L30 2 L29 16 L14 15 Z"
        className={lit ? "fill-gorse-flat" : "fill-field-b"}
        opacity={lit ? 0.6 : 1}
      />
      <path d="M3 14 L14 15 L15 30 L2 29 Z" className="fill-field-b" />
      <path d="M14 15 L29 16 L30 30 L15 30 Z" className="fill-field-a" />
      <g fill="none" className="stroke-lichen" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M2 2 L15 3 L14 15 L3 14 Z" />
        <path d="M15 3 L30 2 L29 16 L14 15 Z" />
        <path d="M3 14 L14 15 L15 30 L2 29 Z" />
        <path d="M14 15 L29 16 L30 30 L15 30 Z" />
      </g>
    </svg>
  )
}
