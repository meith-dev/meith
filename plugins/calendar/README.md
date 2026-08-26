# @meith/plugin-calendar

A shared calendar: events the community can see, linked to the threads that
discuss them.

## What it adds

- **A calendar page** at `/plugins/calendar`, and a navigation item, listing
  what is coming up. Readable by anyone who can read the board.
- **Events linked to threads.** An event can name a thread — paste the link
  or the id — and the calendar links to the discussion.
- **The event, shown in its thread.** A card above the first post says what
  is scheduled and when, so somebody who arrives at the discussion sees the
  event without going looking for it.
- **An organiser roster**, under Admin → Plugins → Calendar.

## Who may add an event

By default, only the members on the organiser roster. An administrator adds
them by username. Turning on **Any member may add an event** opens it to
every signed-in member; guests never may.

Removing an event is allowed to whoever added it, and to any organiser.

This is a roster rather than a usergroup on purpose. `@meith/plugin-kit`
gives a plugin no way to read a member's groups, and the board's own guard
says why: group membership is the Authorizer's business, and a plugin never
gets an `Actor` to ask with. A roster the plugin owns keeps the decision
inside the plugin's own surface, where it belongs.

## What it stores

Two tables in its own namespace: `plugin_calendar_event` and
`plugin_calendar_organiser`. The thread id is a plain column, not a foreign
key — a plugin's schema may not reference the board's, so an event whose
thread has since been deleted simply links to a thread that is not there,
rather than blocking the deletion.
