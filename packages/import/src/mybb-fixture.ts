import {
  mapAttachment,
  mapAvatar,
  mapBan,
  mapForum,
  mapForumSubscription,
  mapPoll,
  mapPollVote,
  mapPost,
  mapPrivateMessage,
  mapRelationList,
  mapReputation,
  mapThread,
  mapThreadSubscription,
  mapUser,
  mapWarning,
} from './map'
import type { MybbTables } from './mybb-rows'
import { groupRows, type ImportSource, type Page, pageByGroup, pageById } from './source'
import type {
  ImportedAttachment,
  ImportedAvatar,
  ImportedBan,
  ImportedForum,
  ImportedPoll,
  ImportedPollVote,
  ImportedPost,
  ImportedPrivateMessage,
  ImportedReputation,
  ImportedSubscription,
  ImportedThread,
  ImportedUser,
  ImportedUserRelation,
  ImportedWarning,
} from './types'

function mapPage<Raw, Mapped>(page: Page<Raw>, map: (row: Raw) => Mapped | null): Page<Mapped> {
  return {
    rows: page.rows.map(map).filter((row): row is NonNullable<Mapped> => row !== null),
    nextCursor: page.nextCursor,
  }
}

export class FixtureMybbSource implements ImportSource {
  readonly name = 'mybb'

  constructor(private readonly data: MybbTables) {}

  users(afterId: number, limit: number): Promise<Page<ImportedUser>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.users ?? [], (row) => row.uid, afterId, limit),
        mapUser,
      ),
    )
  }

  forums(afterId: number, limit: number): Promise<Page<ImportedForum>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.forums ?? [], (row) => row.fid, afterId, limit),
        mapForum,
      ),
    )
  }

  threads(afterId: number, limit: number): Promise<Page<ImportedThread>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.threads ?? [], (row) => row.tid, afterId, limit),
        mapThread,
      ),
    )
  }

  posts(afterId: number, limit: number): Promise<Page<ImportedPost>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.posts ?? [], (row) => row.pid, afterId, limit),
        mapPost,
      ),
    )
  }

  avatars(afterId: number, limit: number): Promise<Page<ImportedAvatar>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.avatars ?? [], (row) => row.uid, afterId, limit),
        mapAvatar,
      ),
    )
  }

  attachments(afterId: number, limit: number): Promise<Page<ImportedAttachment>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.attachments ?? [], (row) => row.aid, afterId, limit),
        mapAttachment,
      ),
    )
  }

  polls(afterId: number, limit: number): Promise<Page<ImportedPoll>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.polls ?? [], (row) => row.pid, afterId, limit),
        mapPoll,
      ),
    )
  }

  pollVotes(afterId: number, limit: number): Promise<Page<ImportedPollVote>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.pollVotes ?? [], (row) => row.vid, afterId, limit),
        mapPollVote,
      ),
    )
  }

  privateMessages(afterId: number, limit: number): Promise<Page<ImportedPrivateMessage>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.privateMessages ?? [], (row) => row.pmid, afterId, limit),
        mapPrivateMessage,
      ),
    )
  }

  threadSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.threadSubscriptions ?? [], (row) => row.sid, afterId, limit),
        mapThreadSubscription,
      ),
    )
  }

  async forumSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    const { fetch, fetchGroup } = groupRows(this.data.forumSubscriptions ?? [], (row) => row.uid)
    const page = await pageByGroup({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.uid,
      fetch,
      fetchGroup,
    })
    return mapPage(page, mapForumSubscription)
  }

  reputation(afterId: number, limit: number): Promise<Page<ImportedReputation>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.reputation ?? [], (row) => row.rid, afterId, limit),
        mapReputation,
      ),
    )
  }

  warnings(afterId: number, limit: number): Promise<Page<ImportedWarning>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.warnings ?? [], (row) => row.wid, afterId, limit),
        mapWarning,
      ),
    )
  }

  bans(afterId: number, limit: number): Promise<Page<ImportedBan>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.bans ?? [], (row) => row.uid, afterId, limit),
        mapBan,
      ),
    )
  }

  userRelations(afterId: number, limit: number): Promise<Page<ImportedUserRelation>> {
    const page = pageById(this.data.relationLists ?? [], (row) => row.uid, afterId, limit)
    return Promise.resolve({
      rows: page.rows.flatMap(mapRelationList),
      nextCursor: page.nextCursor,
    })
  }
}
