# MyBB migration: accounts and messages

Review account, messaging, notification and reputation differences before inviting members to an imported board.

## Notifications and digests

### A notification centre exists at all

**MyBB:** has no notification centre. What a member is told arrives as
e-mail, plus the "You have N new messages" line. When the e-mail is
filtered or never read, nothing on the board records that the member was
told.

**Meith:** every notification is written to a `notifications` row first
and delivered by e-mail second. The board's record is the row; the
e-mail is one transport for it, and the transport can be declined.

**Why.** A warning that changes what a member may do has to be
discoverable from the board itself. Making the record the primary
artefact also gives every notifier — subscriptions, private messages,
reputation — one place to write to rather than an e-mail template each.

**Cost.** One more table on the read path — an unread count in the user
panel on every page for a signed-in member, which is why its index is
partial over unread rows.

### The header carries one menu, not two counts

**MyBB:** the header shows separate figures — a private-message count and,
with a plugin, whatever else wants a number — each a link to its own page.

**Meith:** the header carries a single notifications control. It shows one
badge, the member's total unread across notifications, private messages
and — for a moderator — the moderation work waiting on them, and opens a
menu with a tab for each: **Notifications**, **Messages**, and — for a
member who may reach the moderation panel — a **Mod** tab of the approval
queue and the open reports. Each tab lists only what is still outstanding —
unread notifications, unread messages, the open moderation work — links
every one through to the thing it is about, and (for notifications and
messages) marks entries seen without leaving the page; reading one drops it
from the list, and the tab also links to the full page behind it. With scripting off the control falls back to
the same unread-count links the header carried before, so nothing the menu
adds is load-bearing.

**Why.** Two counts that each open a different page make a member choose
before they have seen anything; one badge answers "is there anything for
me" and one menu shows what, sorted by the kind of thing it is. The **Mod**
tab carries a moderator's actual outstanding work — the same approval-queue
and open-report figures the moderation panel shows — rather than the run of
their own notifications, so it counts what needs a decision.

**Cost.** To fill its tabs the menu reads the first page of the
notifications list and of the inbox, on top of the two unread counts the
header already had; for a moderator it also reads the first page of the
approval queue and of the open reports, alongside the counts the moderation
panel already computes — a few short reads added to a signed-in page, and
only for a member who is signed in.

### On-site delivery cannot be switched off; e-mail can

**MyBB:** every notification channel is opt-out.

**Meith:** the preferences screen configures **e-mail only**. Every kind
is recorded in the notification centre regardless.

**Why.** The centre is the board's evidence that somebody was told. A
member who could erase the record could later say they were never
warned, with the board's own data agreeing — which is worse for the
member too, since a moderator reviewing an appeal has nothing to look
at. Declining e-mail costs nobody anything, because the record survives.

**Cost.** A member who does not want to see a notification cannot remove
it, only mark it read.

### The reporter is told when their report is closed

**MyBB:** tells the reporter nothing.

**Meith:** closing a report raises `report.actioned` for the reporter,
naming the outcome (actioned, or closed without action) and the captured
label of what they reported. The moderator's private note is never
included — the port that carries the notification has no field that
could hold one.

**Why.** A report button that silently swallows reports trains members to
stop using it, and "we looked and decided not to act" is a legitimate
outcome to communicate. E-mail for this kind is **off** by default,
because reporting is exactly the act a member repeats.

### A repeated notification is one row with a count

**MyBB:** does not have the problem, having no notification store.

**Meith:** a raise may carry a dedupe key. While the notification it
produced is unread, further raises with the same key increment a counter
and update the captured facts instead of writing a new row — enforced by
a partial unique index rather than a read-then-write. Once the row is
read, the next raise starts a fresh one.

**Why.** The first notification the board raises without a human behind
it is `system.task_failed`, and a task failing on every tick would
otherwise write 1,440 rows a day per administrator, with an e-mail behind
each. The count is also the more useful number: "this has failed 40
times" is the difference between a blip and an outage.

**Cost.** The first occurrence's details are replaced by the latest —
deliberate for an operational alert, and why warnings carry no dedupe
key: two warnings are two things that happened, and collapsing them
would hide the one that crossed a threshold.

### "Instant" notification means "within a tick"

**MyBB:** sends a subscription e-mail during the request that created the
post.

**Meith:** the post commits, and the `subscriptions.instant` task tells
the subscribers on its next run — at most a minute later on a board whose
tick runs every minute.

**Why.** Notifying inline is an unbounded loop inside the board's hottest
write: one iteration per subscriber, each needing a permission re-check,
each potentially a mail send. On a thread with 500 followers that is a
posting request that takes seconds and fails when the mail provider is
down.

**Cost.** A subscriber can open a thread and see a reply before the
notification about it arrives. That is strictly better than the failure
it avoids, and the delay is bounded by the tick interval.

### A digest's clock is per member, not per board

**MyBB:** has no digests — every subscription is instant e-mail or
nothing.

**Meith:** a subscription's cadence is `instant`, `daily`, `weekly` or
`none`, and the daily/weekly clock is stored per member *and* per
cadence.

**Why.** A board-wide "send the digests now" schedule delivers
everybody's digest at whatever moment the tick fired, and hands somebody
who subscribed on Sunday a "weekly" digest on Monday. Per member, the
interval means what it says; per cadence as well, because one member can
follow one thread daily and another weekly, and one clock cannot serve
both.

### Auto-following starts off, and never overrides a mute

**MyBB:** `subscribemethod` is one admin setting, applied to every
member alike — everybody who posts is subscribed at the same method, or
nobody is. A member who wants "tell me about the threads I start" but
not "the ones I reply to" has no way to ask for it.

**Meith:** two member preferences, "Follow threads I start" and "Follow
threads I reply to" (`/usercp/options`), each an independent cadence —
`instant`, `daily`, `weekly` or `none`, the same four values a
subscription itself can hold. Posting or replying while a preference is
on creates a subscription at that cadence, but only if the thread
carries none already: the insert is `on conflict do nothing`, never an
overwrite, so a thread a member has explicitly muted (`none`) stays
muted through their own reply. The composer's existing "Notify me of
replies" checkbox reflects the preference by default and remains the
per-post override — untick it and that post follows nothing, whatever
the preference says.

**Why.** A single board-wide switch cannot express "my own threads but
not my replies," and a naive auto-subscribe that overwrote an existing
subscription would silently un-mute a thread the moment its owner
happened to reply to it.

**Cost.** New boards seed both preferences to off, and no existing
member is opted in when the feature ships — consent is asked, never
inferred from a column's default. A member who wants the classic
"always follow what I post in" turns both on themselves, once.

### A digest can also nudge a member who has stopped visiting

**MyBB:** has no notion of a member who has drifted away, and nothing to
send one.

**Meith:** `board.digest` is a notification kind of its own, separate
from the follow-driven digest above — **e-mail off by default**, in
keeping with the board's opt-in stance on mass mail (below). A member who
turns it on also picks a cadence, weekly or monthly, and is sent one only
once they have gone quiet for a run of days a board setting decides *and*
their own cadence has elapsed — a member who visits daily never receives
one, however long the feature has been on. Its content is built
per recipient: the busiest threads since that member's own last visit,
filtered through the same permission check as everything else, for the
same reason as
[the online list](mybb-discovery.md#the-online-list-names-a-location-only-when-the-reader-may-know-it) —
a re-engagement e-mail is exactly the kind of thing that must never leak
a private forum's existence to somebody it was written to bring back.

**Why.** A digest that fires for everyone on the same schedule tells an
active member about a thread they already read, and a re-engagement
e-mail that leaks what it is inviting somebody back to see is worse than
sending none.

**Cost.** Two members who go quiet on the same day can receive visibly
different digests — one may list threads the other's does not, because
the forums behind them differ. That is the intended behaviour, not a bug
to reconcile.

### The unsubscribe link acts on POST, not on GET

**MyBB:** unsubscribe links are GETs — following the URL removes the
subscription.

**Meith:** the link opens a page that says what unsubscribing would do
and offers one button. The button is the act.

**Why.** Mail clients, corporate link scanners and preview fetchers
request every URL in a message. A GET that unsubscribed would mean a
member unsubscribed by their own spam filter, never knowing why the
notifications stopped.

**Cost.** One extra click for somebody who genuinely wants out. The page
needs no login and no JavaScript.

### Mass mail is opt-in, and carries an unsubscribe link

**MyBB:** a new account has *Receive e-mails from board administrators*
switched on. Mass mail goes to everybody who has not found the setting
and turned it off, and the message itself carries no way out.

**Meith:** no account is in the mass-mail audience until the member asks
to be. The registration form offers an unticked box, the member's
notification preferences hold the same switch, and the board stores the
moment consent was given. Every message carries an unsubscribe link that
needs no login, and a member who uses it drops out of every campaign
that follows — including one already half sent, because each batch
re-reads the audience.

**Why.** Consent that is assumed at registration is not consent, and a
bulk message with no way out is not one either. Both are conditions of
the GDPR, and neither can be bolted on by an administrator remembering
to be careful.

**Cost.** An imported board arrives with a mass-mail audience of nought:
MyBB's `allownotices` is an opt-out, so importing it as consent would be
recording an answer nobody gave. Members opt in from the board, or by
one deliberate backfill the operator can defend.

### Unsubscribing from a digest does not delete subscriptions

**Meith:** the digest's unsubscribe link switches subscription **e-mail**
off. Every subscription stays, and new posts still appear in the
notification centre.

**Why.** A digest covers many subscriptions, so "unsubscribe" cannot
mean one of them — and taking it to mean "all of them" would delete a
member's follow list because they wanted fewer e-mails. The per-thread
link in an "as it happens" notification *does* end that one
subscription, because there the member knows exactly which thread they
are silencing.

---

## Accounts and profiles

### Timezones are IANA names, never offsets

**MyBB:** stores a numeric offset (`timezone = -5`) plus a DST flag.

**Meith:** stores an IANA zone name (`America/New_York`), validated
against the runtime's tz database. Offsets are refused even though
`Intl` would accept them.

**Why.** An offset cannot express summer time, so it is wrong for half
the year in every zone that observes it — and MyBB's answer, a DST flag
somebody has to flip, is wrong every year for anybody who forgets. The
tz database already knows when the clocks change.

**Cost.** Imported offsets do not map cleanly — `-5` is
`America/New_York` in winter and `America/Chicago`'s summer, and neither
is certain. The importer has to pick a representative zone per offset and
say so.

### The default timezone is the reader's, not the board's

**MyBB:** has one board timezone that every guest and every member who has
not changed it reads the board in.

**Meith:** has no board timezone. A reader's own zone is detected in the
browser and reported to the server in a cookie, so a guest in Auckland
and a guest in Chicago see the same thread at their own two clocks. A
member may pin a zone, and a pinned zone wins on every device.

**Why.** A board timezone is right for whoever set it up and wrong for
everybody else — most of all the guest who cannot change it and the
member who does not know the setting exists. "Posted today at 09:14" has
to mean the reader's today, or it is worse than a bare date.

**Cost.** A reader with JavaScript off reports nothing and gets UTC —
the footer names the zone precisely because that case exists. And the
first page a new reader opens reloads once, after the cookie is written.

### A password change signs out every other device

**MyBB:** changing a password keeps other sessions alive.

**Meith:** every session is revoked, and the device that made the change
is immediately given a fresh one.

**Why.** Changing a password is what somebody does when they think an
account is compromised; one that leaves the attacker's session alive has
done nothing. Re-issuing for the current device is what stops the safe
behaviour from also being the annoying one.

### Changing an e-mail address requires confirming the new one

**MyBB:** with "verify e-mail" off — the default on many boards — the
address changes immediately.

**Meith:** the new address is held in a single-use token and adopted only
when the link sent to it is followed. The current password is required
to ask.

**Why.** Two failures, and the second is the serious one: a typo strands
an account at an address nobody owns, and an unattended session becomes
a full takeover — change the address, request a password reset, done.
Confirming the new address closes both.

**Cost.** A member whose new address bounces keeps the old one, which is
the safe direction. A board with no mail configured cannot change
addresses at all.

### A custom profile field's visibility is per group

**MyBB:** `profilefields` carries `viewableby`/`editableby` as
comma-separated group-id lists plus a `hidden` flag, resolved by
substring check.

**Meith:** a row per (field, group) with nullable `can_view` /
`can_edit`, resolved by the same rule as everything else on this board:
NULL abstains, any explicit grant wins.

**Why.** The same shape as `forum_permissions`, so "who can see this"
has one mental model. A NULL that abstains is also what makes "staff may
edit this" one row instead of a row per group — and a comma-separated
list of ids cannot express "no opinion" at all.

**Cost.** MyBB's *deny by omission* does not survive: a group absent
from `viewableby` becomes a group with no opinion, which inherits. The
importer must write explicit deny rows, or set the field default and
grant the listed groups.

### Registration asks only for fields the new member can edit

**MyBB:** a field marked `required` is asked at registration regardless
of whether the registering member's group can edit it afterwards.

**Meith:** `requiredAtRegistration` is intersected with what the board's
default member group may edit, so a field they could never change is not
asked for either.

**Why.** "What you are asked at registration" and "what you may change
afterwards" disagreeing is a trap — somebody types an answer they can
never correct.

**Cost.** An operator who marks a field required but forgets to let the
registered group edit it gets a field that is silently never asked. The
CLI's `profile-field:add` starts every new field editable by every
group, the state where this cannot bite.

### An emptied field is deleted, not stored as an empty string

**MyBB:** a column per field, with text columns defaulting to `''` — so
"not answered" and "answered with nothing" are the same value.

**Meith:** a row per (member, field), and clearing an answer deletes the
row.

**Why.** Every read would otherwise have to treat two states as one, and
one of them eventually forgets — a profile showing an empty "Pronouns:"
row is the visible half. It also makes an unanswered field cost nothing
on a board with twelve fields and ten thousand members who filled in
two.

**Cost.** A column-per-field table is one join cheaper to read — and a
schema migration every time an operator adds a field, which is the trade
MyBB made and this does not.

### The reset and confirmation forms never say whether an address exists

**MyBB:** the lost-password form answers "the e-mail address you entered
was not found" for an unknown address.

**Meith:** one sentence on every path. An unknown address, an
already-active account, a failed send and a link that really went out
all produce the same notice — and the rate limit is spent *before* the
account is looked up, so its refusal cannot be provoked for one address
and not another.

**Why.** A form that answers "is there an account for this address?"
answers it for anybody, one submission at a time — including for a list
of addresses somebody bought. On a board where membership itself is
sensitive, that is the whole game.

**Cost.** Somebody who mistypes their own address is told a link was
sent, and no link arrives. The resend screen names the address it used,
which is the one place the typo becomes visible.

### An unconfirmed account is a state on the row, not a usergroup

**MyBB:** an account waiting for activation is a member of the "Awaiting
Activation" usergroup, so activating somebody means moving them between
groups.

**Meith:** `users.state` carries `awaiting_activation`, the group is the
board's default, and confirming an address stamps
`users.email_verified_at`. Under the `both` activation method the stamp
is what says "the address is proven, an administrator has not looked
yet".

**Why.** A group is how permissions are decided; lifecycle is not a
permission. Modelling it as one makes every permission question silently
depend on account state, and means a ban — implemented by capturing and
restoring the group — cannot be reasoned about independently. It also
keeps the two facts separable: an account can be proven and unapproved,
which `both` needs and a single group membership cannot express.

**Cost.** An operator cannot grant unactivated accounts a different
permission set by editing a group, because there is no group to edit.

### A username's length is counted in code points

**MyBB:** measures with `my_strlen`, which counts characters where
mbstring is available and bytes where it is not — the same name can be
two lengths on two installations.

**Meith:** `registration.username_min` and `registration.username_max`
are counted in Unicode code points, on every board.

**Why.** The accepted alphabet admits letters outside the Basic
Multilingual Plane, and JavaScript's `String.length` counts UTF-16 code
units — every such letter occupies two, so measuring with it made "your
alphabet decides what the number means" the actual rule.

**Cost.** None; Postgres counts character limits the same way.

---

## Private messages

### A private message is stored once, not once per recipient

**MyBB:** `privatemessages` holds a row per copy — the sender's Sent
Items and each recipient's Inbox carry the full subject and body.

**Meith:** `private_messages` holds the content and
`private_message_copies` holds one small row per participant.

**Why.** A message to twenty people is otherwise twenty copies of the
text, and re-rendering one is twenty writes. It also makes the quota
count *copies* — the thing a member can actually delete.

**Cost.** A join on every folder listing, which the indexes exist for.
And a message everybody has deleted leaves an orphan content row rather
than disappearing by cascade — deliberately, because deleting *your*
copy must not reach into somebody else's mailbox. (Nothing prunes those
orphans today.)

### The quota is storage; the daily cap is separate

**MyBB:** `pmquota` caps stored messages, with no separate send rate for
most groups.

**Meith:** two numbers. `maxPrivateMessagesPerDay` caps sends;
`privateMessageQuota` caps what a member may keep. Both are
0-means-unlimited numerics combined by MAX across groups.

**Why.** They answer different abuse questions: a rate limit slows a
spammer; a storage limit bounds what the board pays to keep. Collapsing
them means a board that wants a hundred stored messages must also allow
a hundred a day.

**Cost.** One more column on `usergroups`, and two numbers to think
about. The seeded ladder sets both, so an unconfigured board behaves
sensibly.

### A full inbox refuses the whole send, and names who is full

**MyBB:** a send to a member over quota fails and reports it.

**Meith:** the same, extended to multiple recipients — if any one of
them is full, **nothing is sent to anybody**, and every full recipient
is named.

**Why.** Partial delivery leaves the sender with a Sent copy claiming a
message went somewhere it did not. Naming the full recipient trades a
small disclosure against the much worse failure of a sender who
believes they were heard.

**Cost.** One member with a full box blocks a message to nine others
until the sender removes their name — the intended outcome, and the
message says which name to remove.

### Reporting is the only way staff read a private message

**MyBB:** a reported PM is copied into the report, and administrators
with database access can read any message.

**Meith:** there is no listing, no search and no browse path into
private messages at all. The report path takes an id and is reached
only from an existing report row, so a moderator reads exactly what was
reported and nothing beside it. A message can only be reported by
somebody who holds a copy of it.

**Why.** A moderation tool that can enumerate private messages is a
surveillance tool with a moderation feature attached.

**Cost.** A moderator cannot see the rest of a conversation for
context — only the message that was reported. Reporting each message is
the way to give them more, which is also the way the member chooses what
staff see.

### Reply addresses the author, not everybody on the message

**MyBB:** reply addresses the sender; "reply to all" addresses everyone.

**Meith:** reply addresses the author, and there is no reply-all.

**Why.** Bcc. A recipient who was bcc'd is hidden from the others, and a
reply-all composed by one of them would either leak that name or
silently drop somebody — and whichever it did, it would do it without
the member noticing.

**Cost.** Answering a group conversation means typing the other names,
which the composer shows in the "To" line of the message being replied
to.

---

## Buddies, ignoring and signatures

### Ignoring hides a post's body; it does not remove the post

**MyBB:** an ignored member's posts are collapsed client-side, with the
body still in the HTML.

**Meith:** the body is withheld **server-side** — it is not in the
response at all — and the post keeps its place in the page and its
number in the thread. A placeholder and a per-post reveal link take its
place.

**Why.** Shipping the text and hiding it with CSS is a preference rather
than a feature. And filtering the post *out* instead would give every
viewer a different page size, make "#12" mean different posts to
different people, and land permalinks on the wrong page.

**Cost.** A thread with an ignored member still has their posts in it,
as placeholders. That is the intended reading: a conversation with holes
in it is still a conversation, and a reader who wants the missing half
is one click away.

### Buddy and ignore are one table, and ignoring is not mutual

**MyBB:** `userlist` with a `type` column — the same shape, but the
ignore is often read as symmetric by the code around it.

**Meith:** one row per **ordered** pair, primary-keyed, so the two lists
are mutually exclusive by construction. `(me, them)` is my opinion of
them and says nothing about theirs of me.

**Why.** A mutual ignore lets anybody silence themselves in somebody
else's eyes by ignoring them first — a griefing tool rather than a
preference.

**Cost.** Two people who both want to stop reading each other need a row
each. One extra click, and the correct model.

### A blocked private message is refused, not silently discarded

**MyBB:** a message to somebody who ignores you is accepted and dropped.

**Meith:** the send is refused, with the **same wording** as a
permission refusal — "X cannot receive private messages" — so it does
not disclose the ignore.

**Why.** Silently discarding it leaves the sender believing they were
heard, the worst outcome for both people. Naming the ignore would make
the send path a way to read somebody's list. The ambiguous refusal is
the only option honest to the sender without betraying the recipient.

**Cost.** A sender cannot tell "they blocked me" from "their group
cannot use PMs" — deliberately, for the reason above.

### A signature's forbidden constructs render as text

**MyBB:** per-group switches for images, links and HTML in signatures,
enforced by stripping or refusing the save.

**Meith:** a signature is parsed with a **narrower set of constructs** —
emphasis, strong, strikethrough, code spans and links. Images, headings,
quotes, lists, tables, rules and code blocks are off, so they come out
as the characters somebody typed.

**Why.** It cannot be bypassed by a construct the build does not know
about, and it degrades — somebody pasting a signature from another board
gets most of it rather than an error. The image is the one that
matters: a remote image under every post is a tracking beacon reporting
each reader's IP to whoever hosts it.

**Cost.** An imported signature that used images loses them, visibly, as
bracketed text the member can delete. The importer should strip the tags
rather than leave them, and say how many it touched.

### A signature is locked, not deleted

**MyBB:** `suspendsignature` with an expiry, plus moderators simply
clearing the text.

**Meith:** a boolean lock with a required reason. The text is kept,
shown back to the member with the reason on their own signature screen,
and cannot be edited while locked.

**Why.** An emptied signature can be retyped the next minute and says
nothing about why it went. Keeping the text is also what lets an appeal
look at what was actually there.

**Cost.** No expiry — an unlock is a second deliberate act. MyBB's timed
suspension is the nicer behaviour and needs a scheduled task; it belongs
with the maintenance sweeps rather than being faked with a column
nothing sweeps.

---

## Reputation

### Reputation has no per-group power multiplier

**MyBB:** `reputationpower` makes a moderator's vote worth more than a
member's.

**Meith:** every rating is worth −1, 0 or +1. The per-group settings are
*whether* you may rate and *how many a day*.

**Why.** A multiplier cannot obey the rule for numeric permissions — MAX
across groups with 0 meaning unlimited — because "unlimited power" is
meaningless. It is the same shape as the flood-interval problem above,
and gets the same answer: leave it out rather than invert the
combination rule for one field.

**Cost.** A board that wants staff endorsements to carry weight cannot
express it. An imported `reputationpower` is dropped, and the importer
should say so rather than silently scaling totals.

### Reputation totals are recomputed, not incremented

**MyBB:** `users.reputation` is adjusted as ratings are added and
removed.

**Meith:** the column is rebuilt with a `sum` over the live rows, inside
the same transaction as whatever changed them — a rating, a withdrawal,
or an account merge, which recounts every affected account.
`warning_points` is rebuilt the same way.

**Why.** An incremented total cannot survive a rating being revised or
withdrawn, and when it drifts nobody notices until somebody counts by
hand — the same decision this board made for the thread and forum
counters.

**Cost.** One extra aggregate per rating, bounded by the number of
ratings one member has. A rating is a deliberate act, not a hot path.

---
