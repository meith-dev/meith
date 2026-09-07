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

The original two tables in its own namespace: `plugin_calendar_event` and
`plugin_calendar_organiser`. The link and its text are two columns added by
a second migration rather than folded into the first, because the first has
already been applied wherever the plugin runs and a migration that has run
is never edited. The thread id is a plain column, not a foreign
key — a plugin's schema may not reference the board's, so an event whose
thread has since been deleted simply links to a thread that is not there,
rather than blocking the deletion.

## RSVP and recurrence

Members can respond Yes, No or Maybe, change their answer, or clear it from
an occurrence page, with JavaScript disabled. Responses belong to the event
and its UTC occurrence date, never the entire series. Counts are public to
board readers; only the member's own status is shown alongside them.
Organisers and the event creator can see the response list, containing only
usernames and answers.

The third, forward-only migration adds recurrence columns and
`plugin_calendar_rsvps`, unique on event, occurrence date and user.
Its only foreign key stays inside the plugin namespace and cascades event
deletion. Changing a series retains responses for unchanged UTC dates;
responses for removed dates are no longer shown. Moving a session to a
different date requires fresh responses.

Weekly and fortnightly repeats advance the stored instant by 7 or 14 days.
Monthly repeats keep the UTC day and time, skipping months without that
day (January 31 next occurs March 31). The optional until date is inclusive.
The agenda expands one UTC month at a time, with previous/next navigation.
The thread card selects from recurring occurrences within a year on either
side of now. ICS downloads contain the series with a standard RRULE.

Calendar inputs and labels use UTC explicitly. Unlike core TimeModel
timestamps, these plugin labels do not use the viewer's time zone; imported
calendar entries are displayed in the calendar application's zone. Local
wall-clock time can shift at daylight-saving boundaries. Reminders are described below.

## Calendar reminders

The cron scheduler runs `plugin.calendar.reminders` every five minutes in UTC.
The operator's **Reminder lead time (hours)** setting defaults to 2 and
accepts 0–168 hours, including fractions; 0 disables reminders. Members
who answered Yes or Maybe receive `plugin.calendar.reminder` with a link
to that occurrence. No and cleared responses receive nothing. Notifications
appear on the board; email is off by default and members can enable it in
their notification preferences.

The task catches up on unsent reminders inside the lead-time window,
including late RSVPs, but never sends for an occurrence that has started.
Delivery depends on the board's system tick. Each run handles up to 100
recipients, earliest events first; a larger backlog drains on later ticks.

A fourth forward-only migration records handled event/date/member triples
in `plugin_calendar_reminders`. Reading a notification, changing an RSVP,
or editing the time within the same UTC date does not cause another reminder.
Moving to a different date creates a new occurrence. Event deletion cascades
to these records. Deleted members are recorded as skipped.

The existing scheduler prevents concurrent normal runs. Failed notification
sends remain eligible for retry. Sending and recording delivery use separate
host APIs, so a process crash between them can retry a delivered notification;
the host coalesces an unread duplicate, but this is not exactly-once delivery.
