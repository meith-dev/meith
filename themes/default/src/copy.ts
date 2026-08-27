import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.whoIsOnline.heading',
    'default.whoIsOnline.online',
    'default.whoIsOnline.member.one',
    'default.whoIsOnline.member.other',
    'default.whoIsOnline.guest.one',
    'default.whoIsOnline.guest.other',
    'default.whoIsOnline.nobody',
    'default.whoIsOnline.onlyGuests',
    'default.whoIsOnline.and',
    'default.whoIsOnline.more',
    'default.whoIsOnline.seeEveryone',
    'default.whoIsOnline.record',
    'default.whoIsOnline.invisible',
  ])
}

export function announcementCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.announcement.posted', 'default.announcement.postedBy'])
}

export function boardIndexCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.boardIndex.boardActivity', 'default.boardIndex.markAllRead'])
}

export function boardStatsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.boardStats.counted',
    'default.boardStats.heading',
    'default.boardStats.members',
    'default.boardStats.newestMember',
    'default.boardStats.notComputed',
    'default.boardStats.posts',
    'default.boardStats.threads',
  ])
}

export function discoveryViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.discoveryView.by',
    'default.discoveryView.dot',
    'default.discoveryView.in',
    'default.discoveryView.lastPost',
    'default.discoveryView.nextArrow',
    'default.discoveryView.reply.one',
    'default.discoveryView.reply.other',
    'default.discoveryView.startedBy',
  ])
}

export function errorNoticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.errorNotice.error',
    'default.errorNotice.forumHome',
    'default.errorNotice.quoteThis',
  ])
}

export function footerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.footer.nav', 'default.footer.timesShownIn'])
}

export function forumDisplayCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.forumDisplay.emptyNoThread',
    'default.forumDisplay.emptyNoThreadFirst',
    'default.forumDisplay.markRead',
    'default.forumDisplay.newThread',
    'default.forumDisplay.noThreadsYet',
    'default.forumDisplay.post.one',
    'default.forumDisplay.post.other',
    'default.forumDisplay.postsLabel',
    'default.forumDisplay.startFirstThread',
    'default.forumDisplay.thread.one',
    'default.forumDisplay.thread.other',
    'default.forumDisplay.threadsLabel',
  ])
}

export function forumRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.forumRow.by',
    'default.forumRow.dot',
    'default.forumRow.newPosts',
    'default.forumRow.noPostsYet',
    'default.forumRow.post.one',
    'default.forumRow.post.other',
    'default.forumRow.postsLabel',
    'default.forumRow.subforums',
    'default.forumRow.thread.one',
    'default.forumRow.thread.other',
    'default.forumRow.threadsLabel',
  ])
}

export function headerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.header.sections'])
}

export function latestPostsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.latestPosts.asOf',
    'default.latestPosts.dot',
    'default.latestPosts.emptyDescription',
    'default.latestPosts.heading',
    'default.latestPosts.in',
    'default.latestPosts.nothingYet',
  ])
}

export function latestThreadsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.latestThreads.asOf',
    'default.latestThreads.dot',
    'default.latestThreads.emptyDescription',
    'default.latestThreads.heading',
    'default.latestThreads.in',
    'default.latestThreads.nothingYet',
    'default.latestThreads.reply.one',
    'default.latestThreads.reply.other',
  ])
}

export function memberProfileCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.memberProfile.about',
    'default.memberProfile.joinedLabel',
    'default.memberProfile.lastVisitLabel',
    'default.memberProfile.memberActions',
    'default.memberProfile.never',
    'default.memberProfile.postsLabel',
    'default.memberProfile.signature',
  ])
}

export function navigationCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.navigation.breadcrumb', 'default.navigation.separator'])
}

export function noticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.notice.dismiss',
    'default.notice.error',
    'default.notice.info',
    'default.notice.success',
    'default.notice.warning',
  ])
}

export function paginationCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.pagination.ellipsis',
    'default.pagination.nav',
    'default.pagination.next',
    'default.pagination.of',
    'default.pagination.page',
    'default.pagination.previous',
  ])
}

export function panelNavCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.panelNav.countCap', 'default.panelNav.waiting'])
}

export function panelPageCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.panelPage.back'])
}

export function postActionsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.postActions.edit',
    'default.postActions.history',
    'default.postActions.moderate',
    'default.postActions.nav',
    'default.postActions.quote',
    'default.postActions.rate',
    'default.postActions.report',
    'default.postActions.restore',
    'default.postActions.warn',
  ])
}

export function postBitCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.postBit.attachment.one',
    'default.postBit.attachment.other',
    'default.postBit.deletedPost',
    'default.postBit.hiddenNotice',
    'default.postBit.ignoringPrefix',
    'default.postBit.joined',
    'default.postBit.online',
    'default.postBit.post.one',
    'default.postBit.post.other',
    'default.postBit.postsLabel',
    'default.postBit.reputation',
    'default.postBit.reputationLabel',
    'default.postBit.showAnyway',
    'default.postBit.staffOnly',
    'default.postBit.waitingApproval',
  ])
}

export function postFormCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.postForm.cannotPost'])
}

export function redirectNoticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.redirectNotice.continueNow',
    'default.redirectNotice.continuingOnItsOwnIn',
    'default.redirectNotice.pleaseWait',
    'default.redirectNotice.redirecting',
    'default.redirectNotice.second.one',
    'default.redirectNotice.second.other',
  ])
}

export function searchFormCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.searchForm.in',
    'default.searchForm.noResults',
    'default.searchForm.placeholder',
    'default.searchForm.search',
    'default.searchForm.searchFor',
    'default.searchForm.sortBy',
  ])
}

export function searchResultsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.searchResults.clearFilters',
    'default.searchResults.closeQuote',
    'default.searchResults.dot',
    'default.searchResults.nextArrow',
    'default.searchResults.nothingMatched',
    'default.searchResults.openQuote',
    'default.searchResults.removeFilter',
    'default.searchResults.removeFilterX',
    'default.searchResults.resultsFor',
    'default.searchResults.searched',
    'default.searchResults.searchedNote',
    'default.searchResults.startNewSearch',
    'default.searchResults.tryFewerWords',
  ])
}

export function shellCopy(t: Translator): SlotCopy {
  return copyFor(t, ['default.shell.skipToContent'])
}

export function subforumListCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.subforumList.heading',
    'default.subforumList.post.one',
    'default.subforumList.post.other',
    'default.subforumList.postsLabel',
    'default.subforumList.thread.one',
    'default.subforumList.thread.other',
    'default.subforumList.threadsLabel',
  ])
}

export function threadRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.threadRow.by',
    'default.threadRow.dot',
    'default.threadRow.latestReply',
    'default.threadRow.locked',
    'default.threadRow.moved',
    'default.threadRow.deleted',
    'default.threadRow.unapproved',
    'default.threadRow.newPosts',
    'default.threadRow.noRepliesYet',
    'default.threadRow.pinned',
    'default.threadRow.reply.one',
    'default.threadRow.reply.other',
    'default.threadRow.repliesLabel',
    'default.threadRow.startedBy',
    'default.threadRow.view.one',
    'default.threadRow.view.other',
    'default.threadRow.viewsLabel',
  ])
}

export function threadViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.threadView.locked',
    'default.threadView.markRead',
    'default.threadView.moved',
    'default.threadView.pinned',
    'default.threadView.reply.one',
    'default.threadView.reply.other',
    'default.threadView.replyAction',
    'default.threadView.repliesLabel',
    'default.threadView.view.one',
    'default.threadView.view.other',
    'default.threadView.viewsLabel',
  ])
}

export function userPanelCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.userPanel.new',
    'default.userPanel.signedIn',
    'default.userPanel.unread',
    'default.userPanel.unreadMessages',
    'default.userPanel.unreadNotifications',
    'default.userPanel.yourAccount',
  ])
}
