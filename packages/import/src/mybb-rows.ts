export interface MybbUser {
  readonly uid: number
  readonly username: string
  readonly email: string
  readonly password: string
  readonly salt: string
  readonly usergroup: number
  readonly regdate: number
  readonly lastvisit: number
  readonly postnum: number
}

export interface MybbForum {
  readonly fid: number
  readonly name: string
  readonly description: string
  readonly type: string
  readonly pid: number
  readonly disporder: number
  readonly linkto: string
  readonly threads: number
  readonly posts: number
}

export interface MybbThread {
  readonly tid: number
  readonly fid: number
  readonly subject: string
  readonly uid: number
  readonly username: string
  readonly dateline: number
  readonly lastpost: number
  readonly replies: number
  readonly views: number
  readonly sticky: number
  readonly closed: string
  readonly visible: number
}

export interface MybbPost {
  readonly pid: number
  readonly tid: number
  readonly fid: number
  readonly uid: number
  readonly username: string
  readonly subject: string
  readonly message: string
  readonly dateline: number
  readonly edituid: number
  readonly edittime: number
  readonly visible: number
}

export interface MybbAvatarRow {
  readonly uid: number
  readonly avatar: string
  readonly avatartype: string
  readonly avatardimensions: string
}

export interface MybbAttachment {
  readonly aid: number
  readonly pid: number
  readonly uid: number
  readonly filename: string
  readonly filetype: string
  readonly filesize: number
  readonly attachname: string
  readonly thumbnail: string
  readonly downloads: number
  readonly dateuploaded: number
}

export interface MybbPoll {
  readonly pid: number
  readonly tid: number
  readonly question: string
  readonly dateline: number
  readonly options: string
  readonly votes: string
  readonly timeout: number
  readonly multiple: number
  readonly public: number
}

export interface MybbPollVote {
  readonly vid: number
  readonly pid: number
  readonly uid: number
  readonly voteoption: number
  readonly dateline: number
}

export interface MybbPrivateMessage {
  readonly pmid: number
  readonly uid: number
  readonly fromid: number
  readonly subject: string
  readonly message: string
  readonly dateline: number
  readonly folder: number
  readonly status: number
  readonly readtime: number
}

export interface MybbThreadSubscription {
  readonly sid: number
  readonly uid: number
  readonly tid: number
  readonly notification: number
}

export interface MybbForumSubscription {
  readonly fid: number
  readonly uid: number
}

export interface MybbReputation {
  readonly rid: number
  readonly uid: number
  readonly adduid: number
  readonly pid: number
  readonly reputation: number
  readonly dateline: number
  readonly comments: string
}

export interface MybbWarning {
  readonly wid: number
  readonly uid: number
  readonly pid: number
  readonly title: string
  readonly points: number
  readonly dateline: number
  readonly issuedby: number
  readonly expires: number
  readonly daterevoked: number
  readonly revokereason: string
  readonly notes: string
}

export interface MybbBan {
  readonly uid: number
  readonly admin: number
  readonly dateline: number
  readonly lifted: number
  readonly reason: string
}

export interface MybbRelationList {
  readonly uid: number
  readonly buddylist: string
  readonly ignorelist: string
}

export interface MybbTables {
  readonly users?: readonly MybbUser[]
  readonly forums?: readonly MybbForum[]
  readonly threads?: readonly MybbThread[]
  readonly posts?: readonly MybbPost[]
  readonly avatars?: readonly MybbAvatarRow[]
  readonly attachments?: readonly MybbAttachment[]
  readonly polls?: readonly MybbPoll[]
  readonly pollVotes?: readonly MybbPollVote[]
  readonly privateMessages?: readonly MybbPrivateMessage[]
  readonly threadSubscriptions?: readonly MybbThreadSubscription[]
  readonly forumSubscriptions?: readonly MybbForumSubscription[]
  readonly reputation?: readonly MybbReputation[]
  readonly warnings?: readonly MybbWarning[]
  readonly bans?: readonly MybbBan[]
  readonly relationLists?: readonly MybbRelationList[]
}
