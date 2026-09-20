# Awards

Install `@meith/plugin-awards`, apply its migrations and open **Admin → Plugins → Awards**. Awards do not grant permissions.

## Create and grant

1. Create an award with name, description and icon (emoji, built-in name or image URL).
2. Set its order and whether repeat grants are allowed.
3. Open **Grant awards**, select it and enter comma-separated usernames and an optional reason.

There is no icon upload. Remote icons require remote-image permission. Unknown usernames stop the request; existing single-only grants are skipped. Switching to single-only is refused while duplicates exist.

Unlisted awards still appear on profiles. **Archive** hides an award publicly and stops grants, preserving history. Delete requires no grants.

Find and revoke grants in the recent-grants table. Notification failure does not undo a saved grant.

## Automatic achievements

Create a rule using post, thread, reputation or days-registered thresholds. All configured thresholds must pass. Set at least one criterion. Blank criteria are ignored; zero is a valid threshold. Tenure uses elapsed 24-hour periods.

Rules grant once per member while the grant exists. Changing or disabling a rule does not revoke awards. Revoked awards can be re-earned while the rule remains active.

**Run now** processes one bounded batch. **Re-check everyone** resets the scan cursor. Check the cursor and completed-pass status on large boards.

## Display

Verify `/plugins/awards`, profiles and posts. **Maximum awards beside each post** defaults to 5; zero hides them. Additional distinct awards use a +N link.

**Show manual grant reasons publicly** defaults on. Dates use UTC; other instances can cache changes for up to one minute. Account deletion removes grants; merging transfers them and collapses duplicates. Automatic revocation, repeating tiers and categories are unsupported.
