/**
 * The pieces every slot in this theme repeats.
 *
 * There is one thing in here, and it earns the file. Seven slots each wrote out
 * the same `profileHref === null ? name : <a>name</a>` ternary, which is the
 * duplication the default theme's `shared.tsx` header calls the single
 * commonest bug in forum software — and it became load-bearing the moment a
 * username acquired a *colour*, because a per-member colour applied at six of
 * seven call sites is a board where a moderator's name is green in a thread and
 * grey in the sidebar.
 */
import type { UserRefModel } from '@meith/theme-kit'

/**
 * A username, linked when there is somewhere to link to.
 *
 * `profileHref` is `null` for a deleted account and the name is still shown,
 * because a thread whose author was deleted is still a thread somebody wrote.
 *
 * `nameClass` carries this member's group colour. It is a class rather than a
 * colour value because the answer differs between light and dark and a `style`
 * attribute cannot hold two — the app emits one rule per coloured group into
 * `<head>`, written to outrank a utility class so the `className` a caller
 * passes here does not have to be audited against it.
 *
 * `linked={false}` for the one case that cannot take an anchor: the last-post
 * cell wraps its whole contents in a link to the post, and an `<a>` inside an
 * `<a>` is markup no browser agrees about.
 *
 * It brings no styling of its own. This theme's name links are deliberately not
 * uniform — a byline is quiet, a sidebar name is `primary` — and a helper that
 * imposed one look would flatten those differences while claiming to be about
 * the ternary. `className` is the caller's, and the only thing added to it is
 * the colour the caller could not have known about.
 */
export function UserRef({
  user,
  className,
  linked = true,
}: {
  user: UserRefModel
  className?: string
  linked?: boolean
}) {
  const classes = [className, user.nameClass].filter(Boolean).join(' ') || undefined

  if (!linked || user.profileHref === null) {
    return <span className={classes}>{user.username}</span>
  }
  return (
    <a href={user.profileHref} className={classes}>
      {user.username}
    </a>
  )
}
