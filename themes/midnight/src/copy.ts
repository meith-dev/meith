import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function announcementCopy(t: Translator): SlotCopy {
  return copyFor(t, ['midnight.announcement.posted', 'midnight.announcement.postedBy'])
}

export function boardIndexCopy(t: Translator): SlotCopy {
  return copyFor(t, ['midnight.boardIndex.activityLabel', 'midnight.boardIndex.markAllRead'])
}

export function boardStatsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.boardStats.heading',
    'midnight.boardStats.threads',
    'midnight.boardStats.posts',
    'midnight.boardStats.members',
    'midnight.boardStats.newest',
    'midnight.boardStats.notCounted',
    'midnight.boardStats.counted',
  ])
}

export function categoryBlockCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.categoryBlock.forumHeader',
    'midnight.categoryBlock.threadsHeader',
    'midnight.categoryBlock.postsHeader',
    'midnight.categoryBlock.lastPostHeader',
  ])
}

export function footerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['midnight.footer.allTimes'])
}

export function forumDisplayCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.forumDisplay.newThread',
    'midnight.forumDisplay.threadHeader',
    'midnight.forumDisplay.repliesHeader',
    'midnight.forumDisplay.viewsHeader',
    'midnight.forumDisplay.lastPostHeader',
    'midnight.forumDisplay.markForumRead',
  ])
}

export function forumRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.forumRow.newPosts',
    'midnight.forumRow.noPosts',
    'midnight.forumRow.postsLabel',
    'midnight.forumRow.threadsLabel',
  ])
}

export function headerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['midnight.header.sectionsLabel'])
}

export function latestPostsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.latestPosts.heading',
    'midnight.latestPosts.empty',
    'midnight.latestPosts.asOf',
  ])
}

export function latestThreadsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.latestThreads.heading',
    'midnight.latestThreads.empty',
    'midnight.latestThreads.asOf',
  ])
}

export function memberProfileCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.memberProfile.joined',
    'midnight.memberProfile.lastVisit',
    'midnight.memberProfile.never',
    'midnight.memberProfile.posts',
    'midnight.memberProfile.signatureLabel',
    'midnight.memberProfile.actionsLabel',
  ])
}

export function navigationCopy(t: Translator): SlotCopy {
  return copyFor(t, ['midnight.navigation.breadcrumbLabel'])
}

export function noticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.notice.dismiss',
    'midnight.notice.kind.info',
    'midnight.notice.kind.success',
    'midnight.notice.kind.warning',
    'midnight.notice.kind.error',
  ])
}

export function paginationCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.pagination.ariaLabel',
    'midnight.pagination.prev',
    'midnight.pagination.next',
    'midnight.pagination.page',
    'midnight.pagination.pageOf',
  ])
}

export function postActionsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.postActions.ariaLabel',
    'midnight.postActions.quote',
    'midnight.postActions.edit',
    'midnight.postActions.history',
    'midnight.postActions.restore',
    'midnight.postActions.rate',
    'midnight.postActions.report',
    'midnight.postActions.warn',
    'midnight.postActions.moderate',
  ])
}

export function postBitCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.postBit.deleted',
    'midnight.postBit.unapproved',
    'midnight.postBit.posts',
    'midnight.postBit.joined',
    'midnight.postBit.rep',
    'midnight.postBit.online',
    'midnight.postBit.ignoredPrefix',
    'midnight.postBit.ignoredSuffix',
    'midnight.postBit.showIt',
  ])
}

export function shellCopy(t: Translator): SlotCopy {
  return copyFor(t, ['midnight.shell.skipToContent'])
}

export function subforumListCopy(t: Translator): SlotCopy {
  return copyFor(t, ['midnight.subforumList.ariaLabel'])
}

export function threadRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.threadRow.newPosts',
    'midnight.threadRow.pinned',
    'midnight.threadRow.repliesLabel',
    'midnight.threadRow.viewsLabel',
    'midnight.threadRow.locked',
    'midnight.threadRow.moved',
    'midnight.threadRow.deleted',
    'midnight.threadRow.unapproved',
    'midnight.threadRow.by',
  ])
}

export function threadViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.threadView.in',
    'midnight.threadView.reply',
    'midnight.threadView.markRead',
    'midnight.threadView.watch',
    'midnight.threadView.watching',
  ])
}

export function userPanelCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.userPanel.guest',
    'midnight.userPanel.signedIn',
    'midnight.userPanel.new',
    'midnight.userPanel.notificationsSrOnly',
    'midnight.userPanel.pm',
    'midnight.userPanel.messagesSrOnly',
    'midnight.userPanel.yourAccount',
  ])
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'midnight.whoIsOnline.onlineNow',
    'midnight.whoIsOnline.noMembers',
    'midnight.whoIsOnline.hidden',
    'midnight.whoIsOnline.guests',
    'midnight.whoIsOnline.fullList',
    'midnight.whoIsOnline.record',
    'midnight.whoIsOnline.on',
  ])
}
