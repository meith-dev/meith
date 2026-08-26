export type DemoForumAccess = 'staff' | 'supporters'

export interface DemoForum {
  readonly key: string
  readonly type: 'category' | 'forum'
  readonly title: string
  readonly slug: string
  readonly description?: string
  readonly parent: string | null
  readonly access?: DemoForumAccess
}

export interface DemoPrefix {
  readonly key: string
  readonly label: string
  readonly token: string | null
  readonly scope: string | null
}

export interface DemoReply {
  readonly author: string
  readonly message: string
  readonly hoursAfter: number
  readonly visibility?: 'visible' | 'unapproved'
  readonly quotes?: number
}

export interface DemoPoll {
  readonly question: string
  readonly options: readonly { readonly label: string; readonly voters: readonly string[] }[]
  readonly closesInDays: number | null
  readonly maxOptions?: number
  readonly allowRevote?: boolean
  readonly publicVotes?: boolean
}

export interface DemoThread {
  readonly forum: string
  readonly author: string
  readonly title: string
  readonly message: string
  readonly daysAgo: number
  readonly prefix?: string
  readonly visibility?: 'visible' | 'unapproved'
  readonly sticky?: boolean
  readonly locked?: boolean
  readonly poll?: DemoPoll
  readonly replies?: readonly DemoReply[]
}

export interface DemoThanks {
  readonly threadTitle: string
  readonly postIndex: number
  readonly from: readonly string[]
}

export interface DemoMessage {
  readonly from: string
  readonly to: readonly string[]
  readonly subject: string
  readonly message: string
  readonly daysAgo: number
}

export interface DemoReport {
  readonly reporter: string
  readonly threadTitle: string
  readonly postIndex: number
  readonly reason: string
  readonly hoursAgo: number
}
