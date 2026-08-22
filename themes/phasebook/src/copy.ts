import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function announcementCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.announcement.announcement'])
}

export function boardIndexCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.boardIndex.activityAriaLabel', 'phasebook.boardIndex.markAllRead'])
}

export function boardStatsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.boardStats.counted',
    'phasebook.boardStats.members',
    'phasebook.boardStats.newestMember',
    'phasebook.boardStats.notComputed',
    'phasebook.boardStats.posts',
    'phasebook.boardStats.threads',
    'phasebook.boardStats.title',
  ])
}

export function discoveryViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.discoveryView.by',
    'phasebook.discoveryView.in',
    'phasebook.discoveryView.lastPost',
    'phasebook.discoveryView.reply.one',
    'phasebook.discoveryView.reply.other',
    'phasebook.discoveryView.startedBy',
  ])
}

export function errorNoticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.errorNotice.error',
    'phasebook.errorNotice.home',
    'phasebook.errorNotice.quote',
  ])
}

export function footerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.footer.ariaLabel', 'phasebook.footer.timezone'])
}

export function forumDisplayCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.forumDisplay.emptyForum',
    'phasebook.forumDisplay.emptyForumInvite',
    'phasebook.forumDisplay.markRead',
    'phasebook.forumDisplay.newThread',
    'phasebook.forumDisplay.noThreadsYet',
    'phasebook.forumDisplay.post.one',
    'phasebook.forumDisplay.post.other',
    'phasebook.forumDisplay.startFirstThread',
    'phasebook.forumDisplay.startThreadIn',
    'phasebook.forumDisplay.thread.one',
    'phasebook.forumDisplay.thread.other',
  ])
}

export function forumRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.forumRow.newPosts',
    'phasebook.forumRow.noPostsYet',
    'phasebook.forumRow.post.one',
    'phasebook.forumRow.post.other',
    'phasebook.forumRow.thread.one',
    'phasebook.forumRow.thread.other',
  ])
}

export function headerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.header.sectionsAriaLabel'])
}

export function latestPostsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.latestPosts.empty',
    'phasebook.latestPosts.in',
    'phasebook.latestPosts.title',
  ])
}

export function latestThreadsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.latestThreads.empty',
    'phasebook.latestThreads.reply.one',
    'phasebook.latestThreads.reply.other',
    'phasebook.latestThreads.title',
  ])
}

export function memberProfileCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.memberProfile.about',
    'phasebook.memberProfile.actionsAriaLabel',
    'phasebook.memberProfile.joined',
    'phasebook.memberProfile.lastVisit',
    'phasebook.memberProfile.never',
    'phasebook.memberProfile.posts',
    'phasebook.memberProfile.signature',
  ])
}

export function navigationCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.navigation.ariaLabel'])
}

export function noticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.notice.dismiss',
    'phasebook.notice.error',
    'phasebook.notice.info',
    'phasebook.notice.success',
    'phasebook.notice.warning',
  ])
}

export function paginationCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.pagination.ariaLabel',
    'phasebook.pagination.next',
    'phasebook.pagination.of',
    'phasebook.pagination.page',
    'phasebook.pagination.previous',
  ])
}

export function panelNavCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.panelNav.waiting'])
}

export function postActionsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.postActions.ariaLabel',
    'phasebook.postActions.edit',
    'phasebook.postActions.history',
    'phasebook.postActions.moderate',
    'phasebook.postActions.quote',
    'phasebook.postActions.rate',
    'phasebook.postActions.report',
    'phasebook.postActions.restore',
    'phasebook.postActions.warn',
  ])
}

export function postBitCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.postBit.deletedPost',
    'phasebook.postBit.hiddenNote',
    'phasebook.postBit.ignoring',
    'phasebook.postBit.moderatorsOnly',
    'phasebook.postBit.online',
    'phasebook.postBit.post.one',
    'phasebook.postBit.post.other',
    'phasebook.postBit.rep',
    'phasebook.postBit.showAnyway',
    'phasebook.postBit.waitingApproval',
  ])
}

export function postFormCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.postForm.cannotPost'])
}

export function redirectNoticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.redirectNotice.continueNow',
    'phasebook.redirectNotice.continuing',
    'phasebook.redirectNotice.pleaseWait',
    'phasebook.redirectNotice.redirecting',
    'phasebook.redirectNotice.second.one',
    'phasebook.redirectNotice.second.other',
  ])
}

export function searchFormCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.searchForm.in',
    'phasebook.searchForm.placeholder',
    'phasebook.searchForm.search',
    'phasebook.searchForm.searchFor',
    'phasebook.searchForm.sortBy',
  ])
}

export function searchResultsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.searchResults.clearFilters',
    'phasebook.searchResults.newSearch',
    'phasebook.searchResults.noHits',
    'phasebook.searchResults.removeFilter',
    'phasebook.searchResults.resultsFor',
    'phasebook.searchResults.searched',
    'phasebook.searchResults.searchedNote',
  ])
}

export function shellCopy(t: Translator): SlotCopy {
  return copyFor(t, ['phasebook.shell.skipToContent'])
}

export function subforumListCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.subforumList.thread.one',
    'phasebook.subforumList.thread.other',
    'phasebook.subforumList.title',
  ])
}

export function threadRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.threadRow.by',
    'phasebook.threadRow.latestReply',
    'phasebook.threadRow.locked',
    'phasebook.threadRow.moved',
    'phasebook.threadRow.newPosts',
    'phasebook.threadRow.noRepliesYet',
    'phasebook.threadRow.pinned',
    'phasebook.threadRow.reply.one',
    'phasebook.threadRow.reply.other',
    'phasebook.threadRow.startedBy',
    'phasebook.threadRow.view.one',
    'phasebook.threadRow.view.other',
  ])
}

export function threadViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.threadView.locked',
    'phasebook.threadView.markRead',
    'phasebook.threadView.moved',
    'phasebook.threadView.pinned',
    'phasebook.threadView.reply.one',
    'phasebook.threadView.reply.other',
    'phasebook.threadView.replyAction',
    'phasebook.threadView.view.one',
    'phasebook.threadView.view.other',
  ])
}

export function userPanelCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.userPanel.accountAriaLabel',
    'phasebook.userPanel.messages',
    'phasebook.userPanel.notifications',
    'phasebook.userPanel.signedIn',
    'phasebook.userPanel.unreadMessages',
    'phasebook.userPanel.unreadNotifications',
  ])
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'phasebook.whoIsOnline.and',
    'phasebook.whoIsOnline.guest.one',
    'phasebook.whoIsOnline.guest.other',
    'phasebook.whoIsOnline.invisible',
    'phasebook.whoIsOnline.member.one',
    'phasebook.whoIsOnline.member.other',
    'phasebook.whoIsOnline.more',
    'phasebook.whoIsOnline.nobody',
    'phasebook.whoIsOnline.on',
    'phasebook.whoIsOnline.online',
    'phasebook.whoIsOnline.onlyGuests',
    'phasebook.whoIsOnline.record',
    'phasebook.whoIsOnline.seeAll',
    'phasebook.whoIsOnline.title',
  ])
}
