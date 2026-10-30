UPDATE attachments a
   SET forum_id = t.forum_id
  FROM posts p
  JOIN threads t ON t.id = p.thread_id
 WHERE a.post_id = p.id AND a.forum_id <> t.forum_id;
