# Announcements, navigation and community email

Use the admin panel to publish announcements, arrange navigation and send community updates. Choose the tool that matches where and when members should see the message.

## Telling people things

### Announcements

**Admin → Content → Announcements** puts a dated notice above the
forums. An announcement is not a pinned thread: nobody can reply to one,
it disappears on its own end date, and removing it removes nothing
anybody wrote — which is what makes it safe to delete when it is stale.

Each one has a title, a Markdown message (rendered the same way a post
is), a **From** date, an optional **Until** date (blank never expires),
and a place: **the whole board**, or one forum — a forum's announcement
is shown to whoever can see that forum, so an announcement on the
organisers' forum reaches only the organisers. Dates are entered in UTC,
and the screen says so. The list shows each announcement's state at a
glance: showing now, scheduled, expired, or switched off.

### The navigation menu

**Admin → Content → Navigation** is the menu across the top of every
page. A new board shows three items — Home, New posts and Search — and
keeps the board's other five pages on the screen beside them, hidden:
Unanswered, My posts, Who's online, Members and Staff. Tick **Shown in
the menu** on any of them to add it. All eight are ordinary rows: rename
one, move it, hide it, or delete it, and add links of your own beside
them. A link can point at a page on the board or at any web address —
the community's main site, the fixtures list, an events calendar.

Each item can be shown to everyone, only signed-out visitors, only
signed-in members, or only staff — and, more narrowly, only to members
of groups you tick. Items can be nested one level deep into sub-menus by
dragging.

### The member list and the staff page

**`/members`** lists every account on the board — searchable by name,
sortable by name, post count or newest arrival — with each member's
displayed groups beside their name. It is shown to anyone whose groups
carry the *Browse the member list* permission, which every shipped group
grants; untick it on Guests to keep the list to signed-in members.

**`/staff`** is the other half of the [staff group flag](groups.md):
every group marked as a staff group appears there in its display order,
listing everyone who holds it — by primary group or live membership.
A staff group nobody is in stays off the page.

### Mass mail

**Admin → Users → Mass mail** (**`/admin/users/mail`**) sends an e-mail
to everybody, or to one group — the Committee group from earlier, say.
Either way it reaches only accounts that are active, not closed, have a
verified address **and have asked the board for its announcements**, and
the screen shows the size of each audience beside it, so the figure next
to a group is how many messages choosing it will queue.

That last condition is the important one, and it is why a brand-new
board's audience is nought. Nobody is enrolled by registering. A member
asks for announcements by ticking the box on the registration form, or
later on their own **Notifications → Preferences** screen; both start
unticked, and the board records the date consent was given. Every
message carries an unsubscribe link at its foot, so a member can stop
them from the message itself, without signing in — and once they do,
they are out of every campaign that follows, including one already half
sent.

So mass mail is the wrong tool for anything every member must see: it
reaches the members who asked, not the membership. A pinned thread or an
[announcement](#announcements) reaches everybody who visits.

Mass mail is queued and delivered in the background, so it needs the
board's mail working and its background worker running — if a mass mail
sits unsent, that is one for the technical person, and
[Operations § Mail](../operations/mail.md) is their page.

### Board activity digest

Every member's **Notifications → Preferences** screen lists a **board
activity digest**, off by default like every other e-mail on that
screen. A member who turns it on also picks how often — **weekly** or
**monthly** — from the box beside it.

The digest is not sent to everybody who turns it on: it is aimed
specifically at members who have drifted away. A member is due one only
once they have not visited the board for a run of days you set —
**Admin → Settings → Board → "Board digest: days away before a member
counts as lapsed"**, seven days out of the box — and even then only when
their own chosen cadence has actually elapsed. A member who reads the
board most days never gets one, however long they leave the feature
switched on.

What it lists is the busiest threads since that member's own last visit,
built for them alone: the same forum permissions that decide what they
can open on the board decide what a digest may name, so two members
turned lapsed on the same day can receive two different digests, and
neither ever sees a thread in a forum closed to them. Every digest
carries its own unsubscribe link, and using it switches off only the
board digest — every other notification preference, and the member's
account, are untouched.

### Closing for maintenance

**Board offline**, under **`/admin/settings?group=board`**, replaces
every board page with a message of your choosing until you switch it
back. Signing in and the admin panel stay reachable, so you can always
turn it off again.
