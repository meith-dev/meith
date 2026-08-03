import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { hasAnyModeratorRight } from "@forum/authorization";
import { requireSlot } from "@forum/theme-kit";

import { filterView, viewerRef } from "@/server/plugin-view";
import { InlineModerationForm } from "@/components/moderation/inline-moderation-form";
import { getContainer } from "@/server/container";
import { getActor } from "@/server/context"
import { getViewerPreferences } from "@/server/viewer-preferences";
import { activeTheme } from "@/server/theme";
import { decodeForumCursor, encodeForumCursor } from "@/view/forum-cursor";
import { FollowForm } from "@/components/account/subscription-forms";
import { buildForumDisplayView } from "@/view/forum-display";
import { canonicalPath } from "@/view/metadata";
import { buildSubscriptionsView } from "@/view/subscriptions";
import {
  INLINE_FORM_ID,
  anyInlineTool,
  inlineOutcomeNotice,
  selectionFor,
} from "@/view/inline-moderation";

/**
 * F76 — one forum's metadata, resolved in the viewer's scope.
 *
 * Same shape and same reasoning as the thread page's: it repeats the locate →
 * authorise sequence rather than trusting the page to have run it, because a
 * metadata function that assumed would put a private forum's title into an
 * Open Graph card on any request where the two got out of step.
 *
 * The canonical carries the page number, so page 3 of a forum is its own
 * document rather than a duplicate of page 1 — which is the single most common
 * way a board ends up with only its first pages in an index.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const id = forumId(slug);
  if (id === null) return { title: "Forum" };

  const actor = await getActor();
  const { forums, authorizer } = getContainer();

  const forum = await forums.findById(id);
  if (!forum || forum.type !== "forum") return { title: "Forum" };

  const matrix = await authorizer.forumMatrix(actor, forum.id);
  if (!authorizer.can(actor, "thread.view", { forumId: forum.id, forum: matrix })) {
    /* The same title an unknown forum gets — see the thread page. */
    return { title: "Forum" };
  }

  const page = Number(query.page ?? "1");
  const canonical = canonicalPath({
    path: `/forum/${forum.id}-${forum.slug}`,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  });
  const description = forum.description ?? `Discussions in ${forum.title}.`;

  return {
    title: forum.title,
    description,
    alternates: {
      canonical,
      types: {
        "application/rss+xml": `/forum/${forum.id}-${forum.slug}/feed.xml`,
      },
    },
    openGraph: {
      type: "website",
      title: forum.title,
      description,
      url: canonical,
    },
    twitter: { card: "summary", title: forum.title, description },
  };
}

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
  /*
   * F57. The member's own page size, falling back to the board setting and then
   * to the module constant — resolved *before* the read, because the page size
   * is the read's `limit` and a preference applied after the query would be a
   * setting that does nothing.
   */
  const preferences = await getViewerPreferences();
  const threadPage = await threads.listForum(id, {
    ...(after === undefined ? {} : { after }),
    limit: preferences.threadsPerPage,
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
    timeZone: preferences.timezone,
  });

  /* F56, same shape as the thread page's control. */
  const { subscriptions } = getContainer();
  const followMode =
    subscriptions === null || actor.userId === null
      ? null
      : await subscriptions.modeFor(actor.userId, "forum", forum.id);
  const followOffered = subscriptions !== null && actor.userId !== null;
  const followModes = buildSubscriptionsView({ rows: [], now: new Date() }).modes;

  const ForumDisplay = requireSlot(activeTheme, "ForumDisplay");
  const Notice = requireSlot(activeTheme, "Notice");
  const ThreadRow = requireSlot(activeTheme, "ThreadRow");
  const SubforumList = requireSlot(activeTheme, "SubforumList");
  const Pagination = requireSlot(activeTheme, "Pagination");

  const notice =
    query.posted === "moderated"
      ? "Your thread was posted and is waiting for a moderator to approve it."
      : inlineOutcomeNotice(query);

  /* F80. `view.thread-row` runs once per row; see the index page for the cost. */
  const pluginContext = { ...viewerRef(actor), forumId: id }

  const threadRows = await Promise.all(
    view.threads.map((thread) =>
      filterView(
        "view.thread-row",
        {
          thread,
          select: selectionFor("thread", thread.id, `“${thread.title}”`, inlineOffered),
        },
        pluginContext,
      ),
    ),
  )

  const subforums =
    view.subforums === null
      ? null
      : await filterView("view.subforum-list", view.subforums, pluginContext)

  const pagination = await filterView("view.pagination", view.pagination, viewerRef(actor))

  const forumDisplayModel = await filterView(
    "view.forum-display",
    {
      ...view.display,
      regions: {
        subforums: subforums === null ? null : <SubforumList {...subforums} />,
        threads: threadRows.map((row) => <ThreadRow key={row.thread.id} {...row} />),
        pagination: <Pagination {...pagination} />,
      },
    },
    pluginContext,
  )

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
      {followOffered && (
        <div className="px-6 pt-4">
          <FollowForm
            target="forum"
            targetId={forum.id}
            mode={followMode}
            modes={followModes}
            back={`/forum/${id}-${forum.slug}`}
            label="Follow this forum"
          />
        </div>
      )}
      <ForumDisplay {...forumDisplayModel} />
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
