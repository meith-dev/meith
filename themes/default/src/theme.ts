/**
 * The default theme's manifest (F25).
 *
 * Slots are listed literally, each one a bare identifier imported directly above.
 * That is a requirement, not a style: `scripts/slot-kinds.mjs` resolves each
 * binding to its module to check which side of the server/client boundary the
 * implementation is on, and a slot map assembled dynamically cannot be checked.
 *
 * **This theme satisfies theme-kit v1 (F77) and is still not complete**, and the
 * difference is the freeze: it fills every `stable` slot, and leaves the two
 * `provisional` ones — `QuickReply` and `EditorToolbar` — unimplemented, because
 * F45 does not exist and a placeholder island would look like a feature.
 * `assertThemeContract` in `apps/forum/src/server/theme.ts` fails the boot if a
 * required slot ever goes missing; `resolveTheme` still reports the provisional
 * pair as missing, which is accurate.
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
import { ForumJump } from './slots/forum-jump'
import { SearchForm } from './slots/search-form'
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

    SearchForm,
    ForumJump,

    RedirectNotice,
    ErrorNotice,
  },
})
