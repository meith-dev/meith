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

INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token",
  "can_view", "can_view_threads", "can_view_others_threads", "can_search", "can_view_profiles")
VALUES (6, 'awaiting_activation', 'Awaiting Activation', 'Registered but not yet activated.', 5, true, false, NULL,
  true, true, true, true, true);
--> statement-breakpoint

INSERT INTO "usergroups" ("id", "key", "title", "description", "display_order", "is_system", "is_staff_group", "badge_token")
VALUES (7, 'banned', 'Banned', 'Denied access to the board.', 50, true, false, 'group-banned');
--> statement-breakpoint

SELECT setval(pg_get_serial_sequence('usergroups', 'id'), (SELECT MAX("id") FROM "usergroups"));
