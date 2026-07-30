/**
 * The default theme's manifest (F25).
 *
 * Slots are listed literally, each one a bare identifier imported directly above.
 * That is a requirement, not a style: `scripts/slot-kinds.mjs` resolves each
 * binding to its module to check which side of the server/client boundary the
 * implementation is on, and a slot map assembled dynamically cannot be checked.
 *
 * **This theme is deliberately incomplete.** Five slots are filled — the shell
 * the auth screens actually render — and the other twenty are unimplemented
 * because the pages they belong to are not built (F29–F35, F39–F45). That is the
 * normal state for the next two phases: `resolveTheme` reports what is missing
 * and `requireSlot` names the slot if a page asks for one that is not there,
 * rather than a theme shipping twenty placeholder components that look like
 * features.
 */

import { defineTheme } from '@forum/theme-kit'

import { Footer } from './slots/footer'
import { Header } from './slots/header'
import { Notice } from './slots/notice'
import { Shell } from './slots/shell'
import { UserPanel } from './slots/user-panel'

export const defaultTheme = defineTheme({
  key: 'default',
  title: 'Default',
  slots: {
    Shell,
    Header,
    UserPanel,
    Footer,
    Notice,
  },
})
