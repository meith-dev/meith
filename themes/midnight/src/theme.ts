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
import { Announcement } from './slots/announcement'
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
    Announcement,

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
