/**
 * `midnight` — the second theme (F78).
 *
 * The acceptance criterion is "materially different, with **no core or
 * theme-kit changes**", and that second half is the test: a theme API that
 * needed a core edit to support its second consumer would not be an API. Nothing
 * in `packages/` changed to make this theme exist. What did change is in
 * `apps/forum` and was a genuine hole rather than an accommodation — the active
 * theme's own token values were never emitted anywhere, so any theme but the
 * default rendered with the default's palette (see D84).
 *
 * ## It extends rather than copies
 *
 * A copy stops receiving fixes the moment it is made, and — more importantly
 * here — it stops receiving *slots*. theme-kit v1 promises that a minor release
 * may add a slot; a theme that inherits gets the default's implementation of the
 * new one and keeps rendering, while a copy silently has a hole in it until
 * somebody notices the page is missing a region.
 *
 * Nineteen slots are overridden — every surface that carries the look. Four are
 * inherited: `PostForm`, `SearchForm`, `RedirectNotice` and `ErrorNotice`, which
 * are forms and interstitials whose default markup is already plain, token-only
 * and correct. Inheriting them is not laziness; it is the partial override that
 * `extends` exists for, and it means this theme's diff is the part that differs.
 *
 * ## The pairing rule a theme author needs to know
 *
 * Midnight renders listings as tables, so `ForumRow` and `ThreadRow` return
 * `<tr>`. That only works because `CategoryBlock` and `ForumDisplay` — which
 * receive the rendered rows as a region — put a `<table>` around them. **Those
 * pairs must be overridden together.** Overriding the row and inheriting the
 * container would put a `<tr>` inside the default theme's `<ul>`, which browsers
 * silently unwrap. The page composes the two and sees neither element, which is
 * the flat-composition rule working as intended: the coupling is between two
 * slots of one theme, and lives here.
 */

import { defaultTheme } from '@meith/theme-default'
import { defineTheme } from '@meith/theme-kit'

import { BoardIndex } from './slots/board-index'
import { BoardStats } from './slots/board-stats'
import { CategoryBlock } from './slots/category-block'
import { Footer } from './slots/footer'
import { ForumDisplay } from './slots/forum-display'
import { ForumRow } from './slots/forum-row'
import { Header } from './slots/header'
import { MemberProfile } from './slots/member-profile'
import { Navigation } from './slots/navigation'
import { Notice } from './slots/notice'
import { Pagination } from './slots/pagination'
import { PostActions } from './slots/post-actions'
import { PostBit } from './slots/post-bit'
import { Shell } from './slots/shell'
import { SubforumList } from './slots/subforum-list'
import { ThreadRow } from './slots/thread-row'
import { ThreadView } from './slots/thread-view'
import { UserPanel } from './slots/user-panel'
import { WhoIsOnline } from './slots/who-is-online'

export const midnightTheme = defineTheme({
  key: 'midnight',
  title: 'Midnight',
  extends: defaultTheme,
  slots: {
    Shell,
    Header,
    UserPanel,
    Navigation,
    Footer,
    Notice,

    BoardIndex,
    CategoryBlock,
    ForumRow,
    BoardStats,
    WhoIsOnline,

    ForumDisplay,
    ThreadRow,
    SubforumList,
    Pagination,

    ThreadView,
    PostBit,
    PostActions,

    MemberProfile,
  },
})
