# @meith/plugin-calendar

A shared calendar: events the community can see, linked to the threads that
discuss them.

## What it adds

- **A calendar page** at `/plugins/calendar`, and a navigation item: an
  agenda grouped by month, each event with its date block, when it is, how
  soon ("in 4 days", "next week"), and where. Readable by anyone who can
  read the board, with a **Past** view for what has already happened.
- **Events linked to threads.** An event can name a thread — paste the link
  or the id — and the calendar links to the discussion.
- **The event, shown in its thread.** A card above the first post says what
  is scheduled and when, so somebody who arrives at the discussion sees the
  event without going looking for it.
- **A link, in the organiser's own words.** An event can carry one address
  and the text to show for it — *Join online* for a video call, *Get
  tickets* for a Meetup or GDG page. Only `http://` and `https://` are
  accepted; anything else is refused rather than rendered, and the anchor
  carries `nofollow ugc noopener noreferrer` like every other member-supplied
  link on the board.
- **An organiser roster**, under Admin → Plugins → Calendar.
- **Add to your calendar** on every event — a `.ics` file the reader's own
  calendar app understands. An event with no end is given an hour, and the
  thread link travels with it as the event URL when the board knows its own
  address.

## Who may add an event

By default, only the members on the organiser roster. An administrator adds
them by username. Turning on **Any member may add an event** opens it to
every signed-in member; guests never may.

Removing an event is allowed to whoever added it, and to any organiser.

This is a roster rather than a usergroup, and the roster is what this plugin
ships with. It keeps the decision inside the plugin's own surface, where a
plugin never gets an `Actor` and cannot see a member's groups at large.

There is now an alternative for a board that would rather run its organisers
as a usergroup. `context.grants.holds(userId, groupKey)` reads whether a
member holds a group, but only one the operator has marked **"may be granted
by plugins"** — the same opt-in the write side needs, and the same privacy
line: every other group stays invisible. A board could mark an
`organisers` group grantable and ask `holds` instead of consulting the
roster. Doing that migration is not part of this plugin as shipped; the
roster remains the default, and the choice is the operator's.

In the downloaded `.ics`, the event's own link becomes the calendar entry's
`URL` — it is the one a reader wants to act on from their calendar app — and
the thread moves to the description. An event with no link of its own keeps
the thread as its `URL`, as before.

## What it stores

Two tables in its own namespace: `plugin_calendar_event` and
`plugin_calendar_organiser`. The link and its text are two columns added by
a second migration rather than folded into the first, because the first has
already been applied wherever the plugin runs and a migration that has run
is never edited. The thread id is a plain column, not a foreign
key — a plugin's schema may not reference the board's, so an event whose
thread has since been deleted simply links to a thread that is not there,
rather than blocking the deletion.
