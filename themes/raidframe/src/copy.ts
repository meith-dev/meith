import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function announcementCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.announcement.kicker',
    'raidframe.announcement.postedFallback',
    'raidframe.announcement.postedByPrefix',
    'raidframe.announcement.separator',
  ])
}

export function authPageCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.authPage.kicker'])
}

export function boardIndexCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.boardIndex.markAllRead'])
}

export function boardStatsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.boardStats.heading',
    'raidframe.boardStats.threads',
    'raidframe.boardStats.posts',
    'raidframe.boardStats.members',
    'raidframe.boardStats.newestMember',
    'raidframe.boardStats.none',
    'raidframe.boardStats.notCountedYet',
    'raidframe.boardStats.counted',
  ])
}

export function categoryBlockCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.categoryBlock.forum',
    'raidframe.categoryBlock.threads',
    'raidframe.categoryBlock.posts',
    'raidframe.categoryBlock.lastPost',
  ])
}

export function discoveryViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.discoveryView.kicker',
    'raidframe.discoveryView.reply.one',
    'raidframe.discoveryView.reply.other',
    'raidframe.discoveryView.startedBy',
    'raidframe.discoveryView.lastPostByPrefix',
  ])
}

export function errorNoticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.errorNotice.errorLabel',
    'raidframe.errorNotice.forumHome',
    'raidframe.errorNotice.requestId',
  ])
}

export function footerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.footer.linksAriaLabel', 'raidframe.footer.allTimesPrefix'])
}

export function forumDisplayCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.forumDisplay.kicker',
    'raidframe.forumDisplay.threadHeader',
    'raidframe.forumDisplay.repliesHeader',
    'raidframe.forumDisplay.viewsHeader',
    'raidframe.forumDisplay.lastPostHeader',
    'raidframe.forumDisplay.threads',
    'raidframe.forumDisplay.posts',
    'raidframe.forumDisplay.newThread',
    'raidframe.forumDisplay.markRead',
  ])
}

export function forumRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.forumRow.newPosts',
    'raidframe.forumRow.linkBadge',
    'raidframe.forumRow.none',
    'raidframe.forumRow.noPostsYet',
    'raidframe.forumRow.separator',
  ])
}

export function headerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.header.sectionsAriaLabel'])
}

export function latestPostsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.latestPosts.heading',
    'raidframe.latestPosts.empty',
    'raidframe.latestPosts.asOf',
  ])
}

export function latestThreadsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.latestThreads.heading',
    'raidframe.latestThreads.empty',
    'raidframe.latestThreads.asOf',
    'raidframe.latestThreads.replies',
  ])
}

export function memberProfileCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.memberProfile.kicker',
    'raidframe.memberProfile.statsHeading',
    'raidframe.memberProfile.posts',
    'raidframe.memberProfile.joined',
    'raidframe.memberProfile.lastVisit',
    'raidframe.memberProfile.never',
    'raidframe.memberProfile.signatureHeading',
    'raidframe.memberProfile.actionsAriaLabel',
  ])
}

export function navigationCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.navigation.ariaLabel'])
}

export function noticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.notice.info',
    'raidframe.notice.success',
    'raidframe.notice.warning',
    'raidframe.notice.error',
    'raidframe.notice.dismiss',
  ])
}

export function paginationCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.pagination.ariaLabel',
    'raidframe.pagination.prev',
    'raidframe.pagination.next',
    'raidframe.pagination.page',
  ])
}

export function panelNavCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.panelNav.waiting'])
}

export function panelPageCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.panelPage.panelLabel.usercp',
    'raidframe.panelPage.panelLabel.modcp',
    'raidframe.panelPage.panelLabel.admincp',
  ])
}

export function postActionsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.postActions.quote',
    'raidframe.postActions.edit',
    'raidframe.postActions.restore',
    'raidframe.postActions.rate',
    'raidframe.postActions.report',
    'raidframe.postActions.warn',
    'raidframe.postActions.moderate',
    'raidframe.postActions.ariaLabel',
  ])
}

export function postBitCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.postBit.deletedNotice',
    'raidframe.postBit.awaitingApprovalNotice',
    'raidframe.postBit.posts',
    'raidframe.postBit.rep',
    'raidframe.postBit.joined',
    'raidframe.postBit.online',
    'raidframe.postBit.ignoredPrefix',
    'raidframe.postBit.ignoredSuffix',
    'raidframe.postBit.showIt',
  ])
}

export function postFormCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.postForm.mode.edit',
    'raidframe.postForm.mode.reply',
    'raidframe.postForm.mode.newThread',
    'raidframe.postForm.cannotPost',
  ])
}

export function redirectNoticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.redirectNotice.kicker',
    'raidframe.redirectNotice.title',
    'raidframe.redirectNotice.continueNow',
    'raidframe.redirectNotice.continuingIn',
    'raidframe.redirectNotice.second.one',
    'raidframe.redirectNotice.second.other',
  ])
}

export function searchFormCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.searchForm.heading',
    'raidframe.searchForm.searchForLabel',
    'raidframe.searchForm.placeholder',
    'raidframe.searchForm.inLabel',
    'raidframe.searchForm.sortByLabel',
    'raidframe.searchForm.submit',
  ])
}

export function searchResultsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.searchResults.kicker',
    'raidframe.searchResults.resultsForPrefix',
    'raidframe.searchResults.resultsForSuffix',
    'raidframe.searchResults.run',
    'raidframe.searchResults.accessNotice',
    'raidframe.searchResults.nothingMatched',
    'raidframe.searchResults.nothingMatchedHint',
    'raidframe.searchResults.startNewSearch',
    'raidframe.searchResults.removeFilter',
    'raidframe.searchResults.clearFilters',
  ])
}

export function shellCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.shell.skipToContent'])
}

export function subforumListCopy(t: Translator): SlotCopy {
  return copyFor(t, ['raidframe.subforumList.ariaLabel', 'raidframe.subforumList.label'])
}

export function threadRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.threadRow.newPosts',
    'raidframe.threadRow.pinned',
    'raidframe.threadRow.locked',
    'raidframe.threadRow.moved',
    'raidframe.threadRow.startedBy',
    'raidframe.threadRow.none',
    'raidframe.threadRow.byPrefix',
  ])
}

export function threadViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.threadView.postReply',
    'raidframe.threadView.pinned',
    'raidframe.threadView.locked',
    'raidframe.threadView.replies',
    'raidframe.threadView.views',
    'raidframe.threadView.markRead',
  ])
}

export function userPanelCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.userPanel.signedIn',
    'raidframe.userPanel.new',
    'raidframe.userPanel.pm',
    'raidframe.userPanel.accountLabel',
  ])
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'raidframe.whoIsOnline.heading',
    'raidframe.whoIsOnline.onlineSuffix',
    'raidframe.whoIsOnline.noMembers',
    'raidframe.whoIsOnline.hidden',
    'raidframe.whoIsOnline.fullList',
    'raidframe.whoIsOnline.guests',
    'raidframe.whoIsOnline.record',
  ])
}
