/**
 * The example theme — a starting point to copy.
 *
 * `themes/midnight` is the worked example of a theme that changes how the
 * board is *built*: twenty-two slots overridden, tables where the default has
 * lists. Iris is the worked example of the far more common theme: the default
 * board in your own colours, plus a slot or two where the markup genuinely
 * disagrees. Copy the directory, rename the key, and go from there.
 *
 * It `extends` the default rather than copying it, so a slot added by a future
 * theme-kit minor renders here through the default's implementation instead of
 * leaving a hole. Only `Footer` is overridden; every other slot is inherited.
 *
 * The policy is docs/theme-api.md; the generated slot reference is
 * docs/theme-slots.md. Two rules the tooling enforces are visible right here:
 * the slot map is written inline with bare identifiers (so
 * `scripts/slot-kinds.mjs` can check the server/client boundary of each
 * binding), and `Footer` is a server component, because a `"use client"`
 * module in a server slot would ship the page to the browser.
 */

import { defaultTheme } from '@meith/theme-default'
import { defineTheme } from '@meith/theme-kit'

import { Footer } from './slots/footer'

export const irisTheme = defineTheme({
  key: 'iris',
  title: 'Iris',
  extends: defaultTheme,
  slots: { Footer },
})
