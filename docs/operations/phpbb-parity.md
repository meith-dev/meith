# phpBB migration differences

Review these changes before importing phpBB. The [import guide](migrating.md) contains commands, coverage and cutover checks. A supported database import does not reproduce phpBB's complete ACL or extension behavior.

## Accounts and permissions

Every imported member enters Meith's ordinary registered group, including former administrators. Re-promote staff and rebuild groups, forum permissions and appointments before opening the board.

phpBB roles, user-level overrides and its allow/deny/never ACL do not translate automatically. Meith resolves each group's forum inheritance and combines the results; a denial in one group does not cancel another group's grant. Test representative accounts rather than assuming old roles survived.

## Posts and formatting

The importer removes phpBB-specific BBCode UID markers and unwraps stored smiley/link markup before converting content to Markdown. Smiley images become their typed codes. Custom BBCode and unsupported tags may remain as text, and presentation such as colors does not survive as identical styling.

Review old content containing nested quotes, code, links and custom tags. [Content conversion details](mybb-content.md) describes the shared converter's behavior and limitations.

## Announcements and moved topics

Ordinary stickies, forum announcements and global announcements import as sticky threads. They do not become Meith's separate announcement feature. Recreate board-wide banners through the admin announcement controls where needed.

phpBB shadow rows for moved topics are not imported as separate discussions. Check old-topic redirects after enabling the legacy URL feature.

## Polls, warnings and bans

Poll options and votes are supported, including the source maximum-choice count and vote-change setting. Verify polls whose behavior matters to the community.

phpBB warnings provide less information than Meith's point/expiry model. Review imported warning effects and any escalation rules; missing source detail cannot be reconstructed.

Only supported member bans transfer. Email/IP bans and exclusion rows need separate review and configuration. Expiry requires scheduled work.

## Messages, contacts and history

Private messages are stored once with their recipient copies. Post attachments transfer through the file import; private-message attachments do not. Uploaded and gallery avatars are supported, while remote avatar URLs are not copied.

Friends and foes map to buddy/ignore relationships with Meith's own behavior. Ignoring does not delete posts or shared conversation history.

phpBB has no built-in reputation data to import. Historic moderator logs and member IP history are not carried across. Meith starts recording its own activity after the move.

## Verify before opening

Follow the import guide's checklist, especially administrator access, private-forum visibility and upload checks. Use [Community administration](../administration/organiser-guide.md) for the new board's ongoing settings.
