CREATE INDEX "admin_log_forum_scope_idx" ON "admin_log" USING gin (("detail" -> 'forumIds') jsonb_path_ops);
