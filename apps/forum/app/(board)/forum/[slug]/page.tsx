import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { hasAnyModeratorRight } from "@forum/authorization";
import { requireSlot } from "@forum/theme-kit";
import { InlineModerationForm } from "@/components/moderation/inline-moderation-form";
import { getContainer } from "@/server/container";
import { getActor } from "@/server/context";
import { activeTheme } from "@/server/theme";
import { decodeForumCursor, encodeForumCursor } from "@/view/forum-cursor";
import { buildForumDisplayView } from "@/view/forum-display";
import {
  INLINE_FORM_ID,
  anyInlineTool,
  inlineOutcomeNotice,
  selectionFor,
} from "@/view/inline-moderation";
import { THREADS_PER_PAGE } from "@/view/paging";

export const metadata: Metadata = { title: "Forum" };

function forumId(value: string): number | null {
  const match = /^(\d+)-/.exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function ForumPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    after?: string;
    page?: string;
    posted?: string;
    /* F52's outcome, written by the inline-moderation action's redirect. */
    did?: string;
    n?: string;
    refused?: string;
    gone?: string;
    skipped?: string;
  }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const id = forumId(slug);
  const after = decodeForumCursor(query.after);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1)
    notFound();

  const actor = await getActor();
  const { forums, threads, authorizer, readState, threadWrites, inlineModeration } =
    getContainer();
  const [rows, visible, read] = await Promise.all([
    forums.listListing(),
    authorizer.visibleForumIds(actor),
    actor.userId === null || readState === null
      ? Promise.resolve(null)
      : readState.forUser(actor.userId),
  ]);
  const forum = rows.find((row) => row.id === id);
  if (!forum || forum.type !== "forum" || !visible.includes(id)) notFound();
  const matrix = await authorizer.forumMatrix(actor, id);
  if (!authorizer.can(actor, "thread.view", { forumId: id, forum: matrix }))
    notFound();

  /*
   * F47: what this actor may see, decided once by the permission model. The
   * listing does not know the word "visible" — it is handed the states it may
   * return, which is what makes "does this page leak the queue" a question with
   * one answer instead of one per query.
   */
  const scope = authorizer.contentScope(actor, { forumId: id, forum: matrix });
  const threadPage = await threads.listForum(id, {
    ...(after === undefined ? {} : { after }),
    limit: THREADS_PER_PAGE,
    scope,
  });
  const nextHref = threadPage.nextCursor
    ? `/forum/${id}-${forum.slug}?after=${encodeForumCursor(threadPage.nextCursor)}&page=${page + 1}`
    : null;
  /*
   * The composer link appears only when this actor may actually use it, and
   * only when the board can accept a post at all (fixture mode cannot). A link
   * to a page that 404s is worse than no link.
   */
  const canPost =
    threadWrites !== null &&
    forum.type === "forum" &&
    authorizer.can(actor, "thread.post", { forumId: id, forum: matrix });

  /*
   * F52's tools, resolved once for this forum. `moderatorRightsIn` reads the
   * appointment and `can()` turns it into a decision that also honours the
   * staff bypasses — the same route F50's bar takes, and the same route the
   * action takes again for itself. A checkbox is not authorisation.
   */
  const moderatorRights = await authorizer.moderatorRightsIn(actor, id);
  const inlineTarget = {
    forumId: id,
    forum: matrix,
    moderatorRights,
    isForumModerator: hasAnyModeratorRight(moderatorRights),
  };
  const inlineRights = {
    approve:
      inlineModeration !== null &&
      authorizer.can(actor, "content.approve", inlineTarget),
    lock:
      inlineModeration !== null && authorizer.can(actor, "thread.lock", inlineTarget),
    stick:
      inlineModeration !== null && authorizer.can(actor, "thread.stick", inlineTarget),
    move:
      inlineModeration !== null && authorizer.can(actor, "thread.move", inlineTarget),
    delete:
      inlineModeration !== null && authorizer.can(actor, "thread.delete", inlineTarget),
  };
  const inlineOffered = anyInlineTool(inlineRights);
  /* Two extra queries for a moderator who may move, none for anybody else. */
  const inlineMoveTargets = !inlineRights.move
    ? []
    : (
        await authorizer.forumIdsWhere(actor, "thread.move")
      ).flatMap((forumId) => {
        const row = rows.find((r) => r.id === forumId);
        return row === undefined || row.type !== "forum" || row.id === id
          ? []
          : [{ id: row.id, title: row.title }];
      });

  const view = buildForumDisplayView({
    forum,
    newThreadHref: canPost ? `/forum/${id}-${forum.slug}/new` : null,
    subforums: rows.filter(
      (row) => row.parentId === id && visible.includes(row.id),
    ),
    page: threadPage,
    pageNumber: page,
    nextHref,
    readState: read,
    markReadAction: read === null ? null : `/api/read/forum/${id}`,
    now: new Date(),
  });

  const ForumDisplay = requireSlot(activeTheme, "ForumDisplay");
  const Notice = requireSlot(activeTheme, "Notice");
  const ThreadRow = requireSlot(activeTheme, "ThreadRow");
  const SubforumList = requireSlot(activeTheme, "SubforumList");
  const Pagination = requireSlot(activeTheme, "Pagination");

  const notice =
    query.posted === "moderated"
      ? "Your thread was posted and is waiting for a moderator to approve it."
      : inlineOutcomeNotice(query);

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      {/*
        Where a held thread lands, and where F52 reports what a bulk action did.
        The author cannot be sent to a thread nobody can see, so the forum tells
        them what happened; dismissal is the same link without the parameter,
        which needs no JavaScript and no state.
      */}
      {notice !== null && (
        <div className="px-6 pt-6">
          <Notice
            kind="info"
            message={notice}
            dismissHref={`/forum/${id}-${forum.slug}`}
          />
        </div>
      )}
      <ForumDisplay
        {...view.display}
        regions={{
          subforums:
            view.subforums === null ? null : (
              <SubforumList {...view.subforums} />
            ),
          threads: view.threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              select={selectionFor(
                "thread",
                thread.id,
                `“${thread.title}”`,
                inlineOffered,
              )}
            />
          )),
          pagination: <Pagination {...view.pagination} />,
        }}
      />
      {/*
        Below the listing, not around it: the checkboxes reach this form by id
        (see `SelectionModel`), so it does not have to contain them — and it
        could not, because `ForumDisplay` renders a mark-read form of its own.
      */}
      {inlineOffered && (
        <InlineModerationForm
          formId={INLINE_FORM_ID}
          scope="threads"
          rights={inlineRights}
          moveTargets={inlineMoveTargets}
          returnTo={`/forum/${id}-${forum.slug}`}
        />
      )}
    </main>
  );
}
