create or replace function notify_thread_event()
returns trigger
language plpgsql
as $$
begin
  if new.topic in (
    'post.created',
    'post.edited',
    'post.deleted',
    'post.visibility_changed',
    'thread.lock_changed'
  ) then
    perform pg_notify(
      'meith_thread_events',
      json_build_object('id', new.id, 'topic', new.topic, 'payload', new.payload)::text
    );
  end if;
  return new;
end;
$$;

create trigger outbox_notify_thread_event
after insert on outbox
for each row execute function notify_thread_event();
