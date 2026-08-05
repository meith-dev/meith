'use server'

/**
 * A member changing how the board looks to them.
 *
 * One action for both halves of the choice — the theme and the colour scheme —
 * posted by ordinary forms with ordinary submit buttons, which is what a
 * browser does natively with no JavaScript and is the same shape the admin
 * panel's own state forms use.
 *
 * ## What it is allowed to trust
 *
 * Nothing. The values arrive from a form anybody can post, and both end up in a
 * cookie the reader could have written by hand anyway — so this validates on
 * the way in *and* the readers validate again (`currentThemeKey` against the
 * enabled list, `currentColourScheme` against the three names). Two checks
 * rather than one because they answer different questions: this one refuses to
 * store nonsense, and the readers refuse to *apply* a value that was fine when
 * it was stored and is not any more, which is exactly what happens when an
 * administrator turns a theme off.
 *
 * ## Why it redirects
 *
 * Because what it changes lives on the `<html>` element, and the client Router
 * Cache holds the layout that renders it. Without the redirect the button
 * writes the cookie and the page does not change until the next full
 * navigation — which is what shipped in the first draft of this file, passed
 * every unit test, and failed the first time anybody pressed it in a browser.
 * `redirectToCurrentPath` has the full account.
 *
 * ## Why it is not rate limited and writes no audit row
 *
 * It changes nothing anybody else can see. A member toggling dark mode forty
 * times is a member who cannot decide, not an attack, and an admin log full of
 * that would bury the entries that matter.
 */
import { cookies } from 'next/headers'

import {
  PREFERENCE_COOKIE_MAX_AGE,
  SCHEME_COOKIE,
  THEME_COOKIE,
  isColourScheme,
} from '@/view/theme-preference'

import { redirectToCurrentPath } from './redirect-back'
import { getBoardThemeStyle } from './theme-runtime'

const COOKIE_OPTIONS = {
  path: '/',
  maxAge: PREFERENCE_COOKIE_MAX_AGE,
  sameSite: 'lax',
  /*
   * Deliberately readable by scripts. It is a display preference, not a
   * credential, and marking it httpOnly would buy nothing while making a
   * future client-side enhancement — an instant repaint before the round trip —
   * impossible to write.
   */
  httpOnly: false,
} as const

/**
 * Store whichever half of the choice was posted.
 *
 * Each half is written only when its field arrived, so a form that carries one
 * of them cannot reset the other to whatever it happened to be rendering. That
 * is a real hazard rather than a theoretical one: the switcher's two controls
 * are two separate `<form>`s precisely because a `<select name="theme">` posts
 * its current value from *any* submit button in the same form, so a single form
 * made pressing "Dark" pin the member's theme as a side effect. See the note in
 * `theme-switcher.tsx`.
 *
 * Both are stored explicitly, including `system`. Storing "no choice" as an
 * absent cookie would work today and would quietly move a member the day an
 * administrator changed the board default: somebody who picked the default on
 * purpose is not the same as somebody who never picked, and only one of them
 * should follow the board.
 */
export async function setAppearanceAction(form: FormData): Promise<void> {
  const jar = await cookies()

  const scheme = form.get('scheme')
  if (typeof scheme === 'string' && isColourScheme(scheme)) {
    jar.set(SCHEME_COOKIE, scheme, COOKIE_OPTIONS)
  }

  const theme = form.get('theme')
  if (typeof theme === 'string' && theme !== '') {
    const { choices } = await getBoardThemeStyle()
    if (choices.some((choice) => choice.key === theme)) {
      jar.set(THEME_COOKIE, theme, COOKIE_OPTIONS)
    }
  }

  await redirectToCurrentPath()
}
