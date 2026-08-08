-- F15 — the default usergroup ladder.
--
-- Hand-written rather than drizzle-kit generated: this is data, not schema, and
-- drizzle-kit only diffs structure. `usergroups.key` exists precisely so seeds
-- and later migrations can address a group without depending on its title.
--
-- Every permission column is NOT NULL with a deny-by-default fallback (false for
-- booleans, 0 for numerics, true for the `requires_*` negative-sense flags), so
-- each group below lists only what it GRANTS. A column absent from an INSERT
-- takes its schema default, which means a new permission added in a later
-- release lands denied everywhere until a migration grants it deliberately —
-- the safe direction.
--
-- The ids are explicit and must stay stable: `ActorBuilder` is constructed with
-- `guestGroupId: 1`, and `AUTH_CONFIG.defaultMemberGroupId` is the registered
-- group. The fixture board in apps/community/src/server/seed-board.ts uses the same
-- numbering (guest 1, registered 2, administrators 3, super moderators 4) so a
-- fixture actor and a Postgres actor resolve identically — that parity is the
-- reason the order looks arbitrary.
--
-- `requires_*` combine with AND across a user's groups (R4.2): any group that
-- exempts a user exempts them. They are therefore left at their `true` default
-- for guests and awaiting-activation, and switched off from Registered up.

INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token",
  "can_view", "can_view_threads", "can_view_others_threads", "can_search",
  "can_view_profiles", "can_view_member_list", "can_download_attachments")
VALUES (1, 'guests', 'Guests', 'Visitors who are not logged in.', 0, true, false, NULL,
  true, true, true, true,
  true, true, true);
--> statement-breakpoint

INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token",
  "can_view", "can_view_threads", "can_view_others_threads", "can_search",
  "can_post_threads", "can_post_replies", "can_post_polls", "can_vote_polls", "can_rate_threads",
  "can_edit_own_posts", "can_delete_own_posts", "can_delete_own_threads",
  "can_upload_attachments", "can_download_attachments", "can_subscribe",
  "can_view_profiles", "can_view_member_list", "can_use_private_messages",
  "can_use_signature", "can_upload_avatar", "can_report_content",
  "requires_thread_approval", "requires_post_approval", "requires_approval_on_edit")
VALUES (2, 'registered', 'Registered', 'Members with an activated account.', 10, true, false, NULL,
  true, true, true, true,
  true, true, true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  false, false, false);
--> statement-breakpoint

-- Administrators bypass forum permissions entirely (R4.2), so the forum-scoped
-- grants here are belt-and-braces: what actually matters is `is_administrator`.
-- The bypass is explicit and logged in @meith/authorization, never emergent.
INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token",
  "can_view", "can_view_threads", "can_view_others_threads", "can_search",
  "can_post_threads", "can_post_replies", "can_post_polls", "can_vote_polls", "can_rate_threads",
  "can_edit_own_posts", "can_delete_own_posts", "can_delete_own_threads",
  "can_edit_others_posts", "can_delete_others_posts", "can_soft_delete_posts",
  "can_view_unapproved", "can_view_deleted", "can_approve_content",
  "can_upload_attachments", "can_download_attachments", "can_subscribe",
  "can_view_profiles", "can_view_member_list", "can_use_private_messages",
  "can_use_signature", "can_upload_avatar", "can_report_content",
  "can_view_board_offline", "can_bypass_flood_check", "can_access_mod_cp",
  "is_super_moderator", "is_administrator", "can_access_admin_cp",
  "requires_thread_approval", "requires_post_approval", "requires_approval_on_edit")
VALUES (3, 'administrators', 'Administrators', 'Full control of the board.', 40, true, true, 'group-admin',
  true, true, true, true,
  true, true, true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  false, false, false);
--> statement-breakpoint

-- Super moderators bypass forum permissions but NOT admin-only actions, so
-- `can_access_admin_cp` is deliberately absent here.
INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token",
  "can_view", "can_view_threads", "can_view_others_threads", "can_search",
  "can_post_threads", "can_post_replies", "can_post_polls", "can_vote_polls", "can_rate_threads",
  "can_edit_own_posts", "can_delete_own_posts", "can_delete_own_threads",
  "can_edit_others_posts", "can_delete_others_posts", "can_soft_delete_posts",
  "can_view_unapproved", "can_view_deleted", "can_approve_content",
  "can_upload_attachments", "can_download_attachments", "can_subscribe",
  "can_view_profiles", "can_view_member_list", "can_use_private_messages",
  "can_use_signature", "can_upload_avatar", "can_report_content",
  "can_bypass_flood_check", "can_access_mod_cp", "is_super_moderator",
  "requires_thread_approval", "requires_post_approval", "requires_approval_on_edit")
VALUES (4, 'super_moderators', 'Super Moderators', 'Moderates every forum.', 30, true, true, 'group-supermod',
  true, true, true, true,
  true, true, true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  false, false, false);
--> statement-breakpoint

-- Moderators get the moderation verbs globally but no bypass: which forums they
-- may act in is decided by `forum_moderators` (R4.1 layer 3).
INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token",
  "can_view", "can_view_threads", "can_view_others_threads", "can_search",
  "can_post_threads", "can_post_replies", "can_post_polls", "can_vote_polls", "can_rate_threads",
  "can_edit_own_posts", "can_delete_own_posts", "can_delete_own_threads",
  "can_edit_others_posts", "can_delete_others_posts", "can_soft_delete_posts",
  "can_view_unapproved", "can_view_deleted", "can_approve_content",
  "can_upload_attachments", "can_download_attachments", "can_subscribe",
  "can_view_profiles", "can_view_member_list", "can_use_private_messages",
  "can_use_signature", "can_upload_avatar", "can_report_content",
  "can_bypass_flood_check", "can_access_mod_cp",
  "requires_thread_approval", "requires_post_approval", "requires_approval_on_edit")
VALUES (5, 'moderators', 'Moderators', 'Moderates the forums they are assigned to.', 20, true, true, 'group-mod',
  true, true, true, true,
  true, true, true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true, true,
  true, true,
  false, false, false);
--> statement-breakpoint

-- Read-only until activated. `requires_*` stay at their true default, so if an
-- administrator does grant posting, it still queues for approval.
INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token",
  "can_view", "can_view_threads", "can_view_others_threads", "can_search", "can_view_profiles")
VALUES (6, 'awaiting_activation', 'Awaiting Activation', 'Registered but not yet activated.', 5, true, false, NULL,
  true, true, true, true, true);
--> statement-breakpoint

-- Every permission left at its deny-by-default value. A ban is expressed by
-- membership of this group plus a `bans` row; F23 restores the prior group on
-- expiry, which is why this must never be anyone's only group historically.
INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token")
VALUES (7, 'banned', 'Banned', 'Denied access to the board.', 50, true, false, 'group-banned');
--> statement-breakpoint

-- Explicit ids do not advance the identity sequence, so without this the first
-- ACP-created group would collide on id 1. Same trap applies to any seed or
-- import that preserves upstream ids (F85).
SELECT setval(pg_get_serial_sequence('usergroups', 'id'), (SELECT MAX("id") FROM "usergroups"));
