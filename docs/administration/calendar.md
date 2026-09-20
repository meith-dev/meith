# Calendar

Install the Calendar plugin and apply its migrations before configuration.

## Create events

Administrators manage the organiser roster in the plugin's admin pages. By default, only roster members create events. **Any member may add an event** permits all signed-in members. The creator and organisers may remove events.

Dates use UTC. Recurrence behaves as follows:

| Frequency | Rule |
|---|---|
| Weekly/fortnightly | Fixed 7/14-day intervals; local times may shift at daylight-saving changes |
| Monthly | Same UTC day; skips months without that date |
| End date | Inclusive |

Editing preserves responses on unchanged UTC dates. Occurrences moved to another UTC date need new responses. Deleting an event removes responses.

## Respond and export

Open an occurrence and choose **Yes**, **No** or **Maybe**. Change or clear the answer on that occurrence. Readers see counts; only the creator and organisers see the full response list. Other members see their own response.

Download `.ics` to add the event to a calendar app. Recurring exports describe the series. Events without end times export with a one-hour duration. The event URL is used before any associated thread URL.

## Reminders

Set **Reminder lead time (hours)** from 0–168; default 2, zero disables. Yes/Maybe respondents receive a board notification. Email requires member opt-in.

The reminder task runs every five minutes with an active scheduler. It processes bounded batches and catches up only before the occurrence starts. Retries can duplicate delivery. See [Scheduled tasks](../operations/scheduled-tasks.md).
