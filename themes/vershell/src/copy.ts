import { mobileHeaderNavCopy } from '@meith/theme-default'
import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function announcementCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.announcement.label',
    'vershell.announcement.posted',
    'vershell.announcement.postedBy',
    'vershell.announcement.dot',
  ])
}

export function boardIndexCopy(t: Translator): SlotCopy {
  return copyFor(t, ['vershell.boardIndex.markAllRead', 'vershell.boardIndex.boardActivity'])
}

export function boardStatsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.boardStats.heading',
    'vershell.boardStats.notComputed',
    'vershell.boardStats.threads',
    'vershell.boardStats.posts',
    'vershell.boardStats.members',
    'vershell.boardStats.newestMember',
    'vershell.boardStats.counted',
  ])
}

export function footerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['vershell.footer.nav', 'vershell.footer.timesShownIn'])
}

export function forumDisplayCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.forumDisplay.label',
    'vershell.forumDisplay.threadsLabel',
    'vershell.forumDisplay.thread.one',
    'vershell.forumDisplay.thread.other',
    'vershell.forumDisplay.postsLabel',
    'vershell.forumDisplay.post.one',
    'vershell.forumDisplay.post.other',
    'vershell.forumDisplay.markRead',
    'vershell.forumDisplay.newThread',
    'vershell.forumDisplay.threadHeader',
    'vershell.forumDisplay.activityHeader',
    'vershell.forumDisplay.lastPostHeader',
    'vershell.forumDisplay.noThreadsYet',
    'vershell.forumDisplay.emptyNoThread',
    'vershell.forumDisplay.emptyNoThreadFirst',
    'vershell.forumDisplay.startFirstThread',
  ])
}

export function forumRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.forumRow.newPosts',
    'vershell.forumRow.subforums',
    'vershell.forumRow.slash',
    'vershell.forumRow.threadsLabel',
    'vershell.forumRow.thread.one',
    'vershell.forumRow.thread.other',
    'vershell.forumRow.postsLabel',
    'vershell.forumRow.post.one',
    'vershell.forumRow.post.other',
    'vershell.forumRow.noPostsYet',
    'vershell.forumRow.dot',
  ])
}

export function headerCopy(t: Translator): SlotCopy {
  return { ...mobileHeaderNavCopy(t), ...copyFor(t, ['vershell.header.sections']) }
}

export function latestPostsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.latestPosts.heading',
    'vershell.latestPosts.asOf',
    'vershell.latestPosts.nothingYet',
    'vershell.latestPosts.emptyDescription',
    'vershell.latestPosts.in',
    'vershell.latestPosts.dot',
  ])
}

export function latestThreadsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.latestThreads.heading',
    'vershell.latestThreads.asOf',
    'vershell.latestThreads.nothingYet',
    'vershell.latestThreads.emptyDescription',
    'vershell.latestThreads.reply.one',
    'vershell.latestThreads.reply.other',
    'vershell.latestThreads.in',
    'vershell.latestThreads.dot',
  ])
}

export function memberProfileCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.memberProfile.label',
    'vershell.memberProfile.memberActions',
    'vershell.memberProfile.postsLabel',
    'vershell.memberProfile.joinedLabel',
    'vershell.memberProfile.lastVisitLabel',
    'vershell.memberProfile.never',
    'vershell.memberProfile.about',
    'vershell.memberProfile.signature',
  ])
}

export function navigationCopy(t: Translator): SlotCopy {
  return copyFor(t, ['vershell.navigation.breadcrumb', 'vershell.navigation.separator'])
}

export function noticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.notice.info',
    'vershell.notice.success',
    'vershell.notice.warning',
    'vershell.notice.error',
    'vershell.notice.dismiss',
  ])
}

export function paginationCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.pagination.nav',
    'vershell.pagination.previousArrow',
    'vershell.pagination.previous',
    'vershell.pagination.ellipsis',
    'vershell.pagination.page',
    'vershell.pagination.of',
    'vershell.pagination.next',
    'vershell.pagination.nextArrow',
  ])
}

export function postActionsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.postActions.quote',
    'vershell.postActions.edit',
    'vershell.postActions.history',
    'vershell.postActions.rate',
    'vershell.postActions.report',
    'vershell.postActions.restore',
    'vershell.postActions.warn',
    'vershell.postActions.moderate',
    'vershell.postActions.nav',
  ])
}

export function postBitCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.postBit.deletedPost',
    'vershell.postBit.waitingApproval',
    'vershell.postBit.staffOnly',
    'vershell.postBit.online',
    'vershell.postBit.postsLabel',
    'vershell.postBit.post.one',
    'vershell.postBit.post.other',
    'vershell.postBit.reputationLabel',
    'vershell.postBit.reputation',
    'vershell.postBit.joined',
    'vershell.postBit.ignoringPrefix',
    'vershell.postBit.hiddenNotice',
    'vershell.postBit.showAnyway',
    'vershell.postBit.attachment.one',
    'vershell.postBit.attachment.other',
  ])
}

export function shellCopy(t: Translator): SlotCopy {
  return copyFor(t, ['vershell.shell.skipToContent'])
}

export function subforumListCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.subforumList.heading',
    'vershell.subforumList.threadsLabel',
    'vershell.subforumList.thread.one',
    'vershell.subforumList.thread.other',
    'vershell.subforumList.postsLabel',
    'vershell.subforumList.post.one',
    'vershell.subforumList.post.other',
  ])
}

export function threadRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.threadRow.pinned',
    'vershell.threadRow.locked',
    'vershell.threadRow.moved',
    'vershell.threadRow.unapproved',
    'vershell.threadRow.deleted',
    'vershell.threadRow.newPosts',
    'vershell.threadRow.startedBy',
    'vershell.threadRow.repliesLabel',
    'vershell.threadRow.reply.one',
    'vershell.threadRow.reply.other',
    'vershell.threadRow.viewsLabel',
    'vershell.threadRow.view.one',
    'vershell.threadRow.view.other',
    'vershell.threadRow.noRepliesYet',
    'vershell.threadRow.latestReply',
    'vershell.threadRow.dot',
  ])
}

export function threadViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.threadView.label',
    'vershell.threadView.pinned',
    'vershell.threadView.locked',
    'vershell.threadView.moved',
    'vershell.threadView.repliesLabel',
    'vershell.threadView.reply.one',
    'vershell.threadView.reply.other',
    'vershell.threadView.viewsLabel',
    'vershell.threadView.view.one',
    'vershell.threadView.view.other',
    'vershell.threadView.watching',
    'vershell.threadView.watch',
    'vershell.threadView.markRead',
    'vershell.threadView.replyAction',
  ])
}

export function userPanelCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.userPanel.signedIn',
    'vershell.userPanel.unreadNotifications',
    'vershell.userPanel.new',
    'vershell.userPanel.unreadMessages',
    'vershell.userPanel.unread',
    'vershell.userPanel.yourAccount',
  ])
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'vershell.whoIsOnline.heading',
    'vershell.whoIsOnline.online',
    'vershell.whoIsOnline.member.one',
    'vershell.whoIsOnline.member.other',
    'vershell.whoIsOnline.guest.one',
    'vershell.whoIsOnline.guest.other',
    'vershell.whoIsOnline.nobody',
    'vershell.whoIsOnline.onlyGuests',
    'vershell.whoIsOnline.and',
    'vershell.whoIsOnline.more',
    'vershell.whoIsOnline.seeEveryone',
    'vershell.whoIsOnline.record',
    'vershell.whoIsOnline.on',
    'vershell.whoIsOnline.invisible',
  ])
}
