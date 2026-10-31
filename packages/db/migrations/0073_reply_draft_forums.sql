UPDATE post_drafts d
   SET forum_id = t.forum_id
  FROM threads t
 WHERE d.thread_id = t.id AND d.forum_id <> t.forum_id;
