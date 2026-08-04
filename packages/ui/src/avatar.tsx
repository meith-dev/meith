/**
 * A member's picture, or the space where one would be.
 *
 * ## Why this is not Base UI's Avatar
 *
 * Base UI ships an `Avatar` whose whole value is the fallback: it watches the
 * `<img>` for a load error and swaps in initials. That is a client component, it
 * would hydrate once per post, and a thread page is fifty posts — which is the
 * one number this product is built around. What it buys is a broken-image state
 * that a board reaches only when its own file store 404s.
 *
 * So this renders the image when there is one and the initial when there is
 * not, on the server, with no branch left to a browser. `referrerPolicy` and
 * `loading="lazy"` are here because avatars can be remote URLs on an imported
 * board, and `width`/`height` are in the markup as well as in CSS so a thread
 * does not reflow as fifty pictures arrive.
 *
 * ## The fallback is a letter, not a silhouette
 *
 * A default avatar image on a board where nobody has set one is a column of
 * identical grey circles: it costs the vertical rhythm of every row and returns
 * nothing. An initial at least tells two adjacent posts apart at a glance, and
 * the element keeps the same box either way so alignment does not depend on
 * whether a member has uploaded anything.
 */

import { cn } from './utils'

export interface AvatarProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** The picture, or `null` — most members on most boards. */
  readonly src?: string | null
  /** Used for the initial and for nothing else; the image itself is decorative. */
  readonly name: string
  /** Rendered pixel size. Also written into the `<img>` to reserve the space. */
  readonly size?: number
}

function Avatar({ className, src = null, name, size = 40, ...props }: AvatarProps) {
  /*
   * `Array.from` rather than `name[0]`: a username can begin with an astral
   * character — an emoji, or a script outside the BMP — and indexing a JS string
   * would take half of one and render a replacement glyph.
   */
  const initial = (Array.from(name.trim())[0] ?? '?').toUpperCase()

  return (
    <span
      data-slot="avatar"
      /*
       * `aria-hidden`, always. The name is beside this in every place the board
       * renders it, and a screen reader that announced the picture as well would
       * read every author twice.
       */
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-md border border-border bg-muted',
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {src === null ? (
        <span
          className="font-medium text-muted-foreground"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {initial}
        </span>
      ) : (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      )}
    </span>
  )
}

export { Avatar }
