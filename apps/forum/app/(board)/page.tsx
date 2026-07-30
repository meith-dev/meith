import type { Metadata } from "next"

import { requireSlot } from "@forum/theme-kit"

import { getContainer } from "@/server/container"
import { getActor } from "@/server/context"
import { activeTheme } from "@/server/theme"
import { buildBoardIndexView } from "@/view/board-index"

export const metadata: Metadata = { title: "Forums" }

/**
 * The board index (F29).
 *
 * The shape every page in this phase copies:
 *
 *   1. resolve the actor;
 *   2. read data through the container — never `@forum/db`, which
 *      dependency-cruiser enforces for everything under `app/`;
 *   3. build a view model with a pure function in `src/view/`;
 *   4. resolve slots and compose them.
 *
 * ## Two reads, and why not one
 *
 * `listListing()` returns every forum with its counters in one query.
 * `visibleForumIds(actor)` is a constant three (it was a 32-query N+1 until D26).
 * Filtering in the database instead would mean expressing the four-level
 * permission resolution as SQL, which is the model F20/F21 exist to keep out of
 * queries — and the forum table is tens of rows, not millions.
 *
 * ## Why this page is not cached
 *
 * Every row depends on who is asking: `visibleForumIds` differs per actor, and
 * F32's unread marks differ per user. `cachedGlobal` is for global data only, and
 * a cached permission-filtered index is precisely how a private forum leaks —
 * the failure the caching harness was built to prevent. The cacheable part is the
 * forum *structure*, which is already cached a layer down (F16).
 */
export default async function BoardIndexPage() {
  const actor = await getActor()
  const { forums, authorizer, readState } = getContainer()

  const [rows, visible, read] = await Promise.all([
    forums.listListing(),
    authorizer.visibleForumIds(actor),
    actor.userId === null || readState === null ? Promise.resolve(null) : readState.forUser(actor.userId),
  ])

  const view = buildBoardIndexView({
    rows,
    visibleForumIds: new Set(visible),
    ...(read === null ? {} : { unreadForumIds: read.unreadForumIds }),
    markAllReadAction: read === null ? null : '/api/read/all',
    /*
     * One clock for the whole render. Calling `new Date()` per row would let a
     * page straddle midnight and render "Today" above "Yesterday" for posts a
     * second apart.
     */
    now: new Date(),
  })

  const BoardIndex = requireSlot(activeTheme, "BoardIndex")
  const CategoryBlock = requireSlot(activeTheme, "CategoryBlock")
  const ForumRow = requireSlot(activeTheme, "ForumRow")

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <BoardIndex
        {...view.index}
        regions={{
          categories: view.blocks.map((entry) => (
            <CategoryBlock key={entry.block.category.id} category={entry.block.category}>
              {entry.forums.map((forum) => (
                <ForumRow key={forum.id} forum={forum} />
              ))}
            </CategoryBlock>
          )),
          /* F75 supplies both. Rendering nothing beats rendering a zero. */
          stats: null,
          online: null,
        }}
      />
    </main>
  )
}
