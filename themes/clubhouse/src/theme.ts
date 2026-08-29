import { defaultTheme } from '@meith/theme-default'
import { defineTheme } from '@meith/theme-kit'

import {
  announcementCopy,
  boardIndexCopy,
  boardStatsCopy,
  categoryBlockCopy,
  footerCopy,
  forumDisplayCopy,
  forumRowCopy,
  headerCopy,
  latestPostsCopy,
  latestThreadsCopy,
  memberProfileCopy,
  navigationCopy,
  noticeCopy,
  paginationCopy,
  postActionsCopy,
  postBitCopy,
  shellCopy,
  subforumListCopy,
  threadRowCopy,
  threadViewCopy,
  userPanelCopy,
  whoIsOnlineCopy,
} from './copy'
import { Announcement } from './slots/announcement'
import { BoardIndex } from './slots/board-index'
import { BoardStats } from './slots/board-stats'
import { CategoryBlock } from './slots/category-block'
import { Footer } from './slots/footer'
import { ForumDisplay } from './slots/forum-display'
import { ForumRow } from './slots/forum-row'
import { Header } from './slots/header'
import { LatestPosts } from './slots/latest-posts'
import { LatestThreads } from './slots/latest-threads'
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

export const clubhouseTheme = defineTheme({
  key: 'clubhouse',
  title: 'Clubhouse',
  version: '0.25.1',
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
    LatestThreads,
    LatestPosts,

    ForumDisplay,
    ThreadRow,
    SubforumList,
    Pagination,

    ThreadView,
    PostBit,
    PostActions,

    MemberProfile,
  },
  copy: {
    Announcement: announcementCopy,
    BoardIndex: boardIndexCopy,
    BoardStats: boardStatsCopy,
    CategoryBlock: categoryBlockCopy,
    Footer: footerCopy,
    ForumDisplay: forumDisplayCopy,
    ForumRow: forumRowCopy,
    Header: headerCopy,
    LatestPosts: latestPostsCopy,
    LatestThreads: latestThreadsCopy,
    MemberProfile: memberProfileCopy,
    Navigation: navigationCopy,
    Notice: noticeCopy,
    Pagination: paginationCopy,
    PostActions: postActionsCopy,
    PostBit: postBitCopy,
    Shell: shellCopy,
    SubforumList: subforumListCopy,
    ThreadRow: threadRowCopy,
    ThreadView: threadViewCopy,
    UserPanel: userPanelCopy,
    WhoIsOnline: whoIsOnlineCopy,
  },
})
