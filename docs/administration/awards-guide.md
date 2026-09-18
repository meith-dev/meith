# Give awards and achievements

Awards recognizes contributions without granting permissions. An operator must install `@meith/plugin-awards` and apply its migrations. Administrators then work under **Admin → Plugins → Awards**.

## Create an award

Enter a name, description and icon. Supported icons include emoji, built-in names and image URLs; there is no icon upload. Remote images also need the board's remote-image setting.

Choose display order and whether a member may hold the award more than once. Changing to single-only is refused while duplicates exist.

**Listed in the catalogue** controls discovery, not privacy: an unlisted award can still appear on a holder's profile. **Archive** hides it publicly and stops new grants while retaining history. Delete is available only when there are no grants.

## Grant or revoke an award

Open **Grant awards**, choose the award, enter comma-separated usernames and an optional reason, then submit. Unknown names stop the request before assignment. Existing single-only awards are skipped.

Use the recent grants table and username filter to find a grant and revoke it. Members can be notified according to the plugin setting and their delivery preferences. A notification failure does not undo an already saved grant.

## Create an automatic achievement

Under **Rules**, choose an award and enter one or more supported thresholds: posts, threads, reputation or days registered. Every configured threshold must be satisfied. Blank criteria are ignored; an explicit zero allows every member for that criterion. Tenure uses elapsed 24-hour periods.

A rule grants once per member while its grant exists. Raising a threshold or disabling/deleting a rule does not revoke previous awards. If you revoke a rule-earned award while the rule remains enabled, it can be granted again when the member is evaluated.

**Run now** evaluates a bounded batch. **Re-check everyone** resets the full-scan cursor. Large boards need multiple scheduled runs; inspect the cursor and last completed pass rather than assuming one click evaluated every member.

## Check the member display

Open `/plugins/awards`, a holder's profile and one of their posts. **Maximum awards beside each post** defaults to 5; zero hides them. Additional distinct awards appear through a +N link.

**Show manual grant reasons publicly** is on by default. Turn it off when reasons should remain in administration. Award dates use UTC. Other application instances can show cached award information for up to a minute after changes.

Account deletion removes grants; account merging moves them and collapses relevant duplicates. Awards do not provide repeating tiers, categories or automatic revocation when eligibility later falls.
