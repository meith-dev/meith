# Run community events

The Calendar plugin adds events, recurring occurrences and member responses. An operator must install the plugin and apply its migrations before administrators configure it.

## Open the calendar

Use the board's Calendar navigation item. Open an occurrence to see its details and, when signed in, respond **Yes**, **No** or **Maybe**. You can change or clear your answer. Responses belong to that occurrence, not the whole series.

Counts are visible to board readers. Only the event creator and organiser roster can see the username-and-response list. Other members see their own response alongside the counts.

## Choose who creates events

Administrators manage the organiser roster in the plugin's admin pages. By default, only roster members create events. **Any member may add an event** permits all signed-in members; guests still cannot add one.

The shipped plugin uses this roster, not an arbitrary community group. The event creator and organisers can remove an event.

## Set dates and recurrence

Calendar forms and labels use **UTC**. Weekly and fortnightly series advance by fixed seven- or fourteen-day intervals; local clock times can shift at daylight-saving changes. Monthly series keep the UTC day and skip months without that date. The optional end date is inclusive.

Editing a series preserves responses on unchanged UTC dates. A moved occurrence needs new responses; removed occurrences no longer show their old responses. Deleting the event removes its responses.

Upcoming includes ongoing events; Past contains completed ones. Follow the pagination links for more occurrences, or browse a specific month.

## Export to a calendar app

Download the event's `.ics` file and open it in your calendar application. Recurring exports describe the series. The receiving application displays times in its configured zone. An event without an end time is exported with a one-hour duration.

An event's own URL is preferred as the calendar link; otherwise the associated thread supplies it.

## Configure reminders

**Reminder lead time (hours)** defaults to 2 and accepts 0–168, including fractions. Set 0 to disable reminders. Members who answered Yes or Maybe receive a board notification before the occurrence. Email reminders are off by default and can be enabled in the member's notification preferences.

The reminder task runs every five minutes when the board scheduler is running. It catches up only before the occurrence starts and processes a bounded batch, so a large backlog can delay delivery. A crash can cause a delivery retry; reminders are not an exactly-once guarantee.

If reminders stop, have the operator check [Scheduled tasks](../operations/scheduled-tasks.md).
