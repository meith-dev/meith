/**
 * The default theme's manifest (F25).
 *
 * Slots are listed literally, each one a bare identifier imported directly above.
 * That is a requirement, not a style: `scripts/slot-kinds.mjs` resolves each
 * binding to its module to check which side of the server/client boundary the
 * implementation is on, and a slot map assembled dynamically cannot be checked.
 *
 * **This theme is deliberately incomplete.** The shell (F27), the reading
 * surfaces (F29–F34) and the composer (F39) are filled; the rest are
 * unimplemented because the pages they belong to are not built (F40–F45). That
 * is the normal state for this phase: `resolveTheme` reports what is missing and `requireSlot` names
 * the slot if a page asks for one that is not there, rather than a theme shipping
 * placeholder components that look like features.
 */

import { defineTheme } from '@forum/theme-kit'

import { BoardIndex } from './slots/board-index'
import { BoardStats } from './slots/board-stats'
import { CategoryBlock } from './slots/category-block'
import { WhoIsOnline } from './slots/who-is-online'
import { Footer } from './slots/footer'
import { ForumRow } from './slots/forum-row'
import { ForumDisplay } from './slots/forum-display'
import { Header } from './slots/header'
import { Navigation } from './slots/navigation'
import { Notice } from './slots/notice'
import { Shell } from './slots/shell'
import { UserPanel } from './slots/user-panel'
import { Pagination } from './slots/pagination'
import { SubforumList } from './slots/subforum-list'
import { ThreadRow } from './slots/thread-row'
import { ThreadView } from './slots/thread-view'
import { PostBit } from './slots/post-bit'
import { PostForm } from './slots/post-form'
import { PostActions } from './slots/post-actions'
import { MemberProfile } from './slots/member-profile'
import { RedirectNotice } from './slots/redirect-notice'
import { ErrorNotice } from './slots/error-notice'

export const defaultTheme = defineTheme({
  key: 'default',
  title: 'Default',
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

    PostForm,

    MemberProfile,

    RedirectNotice,
    ErrorNotice,
  },
})
