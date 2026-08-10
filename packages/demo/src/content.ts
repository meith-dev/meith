/**
 * The demo board's content, written out rather than generated.
 *
 * Generated text is why most demos read as demos: forty threads called "Test
 * thread 12" tell a visitor nothing about whether the software is any good at
 * holding a conversation. Everything here is a conversation somebody could
 * plausibly have had on a board about running boards, which is what
 * demo.meith.dev is.
 *
 * Times are **offsets from the reset**, never absolute dates. A demo seeded
 * with real timestamps is fresh on the day it is written and visibly abandoned
 * a month later; these re-date themselves on every reset, so the newest post is
 * always minutes old and the board is always four hundred days into its life.
 */

export interface DemoForum {
  readonly key: string
  readonly type: 'category' | 'forum'
  readonly title: string
  readonly slug: string
  readonly description?: string
  readonly parent: string | null
}

export interface DemoReply {
  readonly author: string
  readonly message: string
  /** Hours after the thread's opening post. */
  readonly hoursAfter: number
  readonly visibility?: 'visible' | 'unapproved'
  /** Quotes an earlier post: 0 is the opening post, 1 the first reply. */
  readonly quotes?: number
}

export interface DemoPoll {
  readonly question: string
  /**
   * One entry per option: its label, and the accounts that voted for it. Voters
   * are named rather than counted because a vote is a row keyed by user, and a
   * count of nine with six accounts to cast it is a poll that cannot exist.
   */
  readonly options: readonly { readonly label: string; readonly voters: readonly string[] }[]
  readonly closesInDays: number | null
}

export interface DemoThread {
  readonly forum: string
  readonly author: string
  readonly title: string
  readonly message: string
  /** Days before the reset that the thread was opened. */
  readonly daysAgo: number
  readonly visibility?: 'visible' | 'unapproved'
  readonly sticky?: boolean
  readonly locked?: boolean
  readonly poll?: DemoPoll
  readonly replies?: readonly DemoReply[]
}

export const DEMO_FORUMS: readonly DemoForum[] = [
  { key: 'cat-board', type: 'category', title: 'The board', slug: 'the-board', parent: null },
  {
    key: 'announcements',
    type: 'forum',
    title: 'Announcements',
    slug: 'announcements',
    description: 'Releases, outages, and anything the staff need everyone to have read.',
    parent: 'cat-board',
  },
  {
    key: 'introductions',
    type: 'forum',
    title: 'Introductions',
    slug: 'introductions',
    description: 'New here? Say what you are building.',
    parent: 'cat-board',
  },

  {
    key: 'cat-running',
    type: 'category',
    title: 'Running a board',
    slug: 'running-a-board',
    parent: null,
  },
  {
    key: 'support',
    type: 'forum',
    title: 'Help and support',
    slug: 'help-and-support',
    description: 'Something is not working. Post the error and someone will know it.',
    parent: 'cat-running',
  },
  {
    key: 'hosting',
    type: 'forum',
    title: 'Hosting and deployment',
    slug: 'hosting-and-deployment',
    description: 'Servers, proxies, backups, and the bills.',
    parent: 'cat-running',
  },
  {
    key: 'moderation',
    type: 'forum',
    title: 'Moderation',
    slug: 'moderation',
    description: 'Rules, spam, and the people problems software cannot solve.',
    parent: 'cat-running',
  },

  {
    key: 'cat-making',
    type: 'category',
    title: 'Making things',
    slug: 'making-things',
    parent: null,
  },
  {
    key: 'themes',
    type: 'forum',
    title: 'Themes',
    slug: 'themes',
    description: 'Slots, tokens, and what a theme is allowed to touch.',
    parent: 'cat-making',
  },
  {
    key: 'plugins',
    type: 'forum',
    title: 'Plugins',
    slug: 'plugins',
    description: 'Hooks, payloads, and containing your own failures.',
    parent: 'cat-making',
  },
  {
    key: 'offtopic',
    type: 'forum',
    title: 'Anything else',
    slug: 'anything-else',
    description: 'The other forum.',
    parent: 'cat-making',
  },
]

export const DEMO_THREADS: readonly DemoThread[] = [
  // ── Announcements ──────────────────────────────────────────────────────────
  {
    forum: 'announcements',
    author: 'admin',
    title: 'Read this first: what this board is',
    daysAgo: 604,
    sticky: true,
    message: [
      'This is a board for people who run boards. If you are here because you are thinking about moving a community off something hosted, or because you have already done it and it went sideways, you are in the right place.',
      '',
      'Three things worth knowing before you post:',
      '',
      '- **Say what you actually run.** Version, how you deploy it, and whether there is a proxy in front. Half the answers here depend on it.',
      '- **Paste the error, not a summary of the error.** Nobody has ever been helped faster by a paraphrase.',
      '- **We are all volunteers**, including the staff. Nothing here is a support contract and nobody is on call.',
      '',
      'The rules are in the next thread and they are short.',
    ].join('\n'),
    replies: [
      {
        author: 'niamh',
        hoursAfter: 3,
        message:
          'Pinning a note for the search-engine arrivals: if you landed here looking for how to *install* it, the docs are the better starting point. This forum is for after that.',
      },
    ],
  },
  {
    forum: 'announcements',
    author: 'admin',
    title: 'The rules, in four lines',
    daysAgo: 604,
    sticky: true,
    locked: true,
    message: [
      '1. Be civil to the person, however wrong the post.',
      '2. No advertising. Linking your own board in a thread about your own board is fine.',
      '3. One thread per problem. Do not append a new problem to a solved thread.',
      '4. If you disagree with a moderator, say so in a report or a message, not in the thread.',
      '',
      'That is the whole thing. Locked because there is nothing to discuss — if you think a rule is wrong, open a thread in Anything else and make the case.',
    ].join('\n'),
  },
  {
    forum: 'announcements',
    author: 'admin',
    title: '0.1.0 is out',
    daysAgo: 21,
    message: [
      'Tagged this morning. The short version of what changed:',
      '',
      '- Search is on a keyset now, so page 40 costs what page 1 costs.',
      '- The permission matrix resolves per actor per forum instead of per request, which took about 300ms off a busy index.',
      '- Themes have a frozen slot contract. If yours renders on 0.1.0 it will keep rendering, and if it does not, the error names the slot.',
      '',
      'Upgrade notes are in the docs. Back up first — not because this release is risky, but because "back up first" is the advice that is never wrong.',
    ].join('\n'),
    replies: [
      {
        author: 'mira',
        hoursAfter: 2,
        message:
          'Upgraded a 60k-post board in about four minutes, most of which was the search reindex. No drama.',
      },
      {
        author: 'tomas',
        hoursAfter: 5,
        message:
          'Same here, though I had to bump the pool size afterwards — the reindex and normal traffic together were more connections than I had left. Worth a line in the notes maybe.',
      },
      {
        author: 'admin',
        hoursAfter: 6,
        quotes: 2,
        message: 'Fair. Added to the upgrade page — thank you.',
      },
      {
        author: 'ada',
        hoursAfter: 19,
        message:
          'The slot freeze is the bit I care about. I have rewritten my theme twice for other software and I was not going to do it a third time.',
      },
    ],
  },

  // ── Introductions ──────────────────────────────────────────────────────────
  {
    forum: 'introductions',
    author: 'rosa',
    title: 'Hello — moved 40k posts last spring',
    daysAgo: 298,
    message: [
      'Hi all. I run a board for a translation co-op, about 300 active members and a decade of archives. We came off a hosted forum in March because the price went up 4x with a month of notice.',
      '',
      'The import took three sessions over a weekend, which sounds bad and was actually fine — it is resumable, so I ran it until I got bored and started it again the next evening. Attachments were the slow part.',
      '',
      'Happy to answer questions from anyone in the same spot.',
    ].join('\n'),
    replies: [
      { author: 'ken', hoursAfter: 4, message: 'Welcome. How did the old URLs go — did you keep them working?' },
      {
        author: 'rosa',
        hoursAfter: 7,
        message:
          'Yes, and it mattered more than I expected. The legacy redirects cover the old thread and forum paths, so ten years of links off other sites still land. Two or three odd cases I redirected by hand at the proxy.',
      },
      { author: 'dev', hoursAfter: 30, message: 'Bookmarking this for when my renewal comes up. Thanks for writing it down.' },
    ],
  },
  {
    forum: 'introductions',
    author: 'mira',
    title: 'Self-hosting one service at a time, this is number six',
    daysAgo: 187,
    message: [
      'Started with a mail server, which was a mistake, and have been working back towards easier things ever since. This board is for a group of about forty people who restore old radios.',
      '',
      'Not a developer. If the deployment path had needed a `docker-compose.yml` written by hand I would have closed the tab, so thank you for the panel route.',
    ].join('\n'),
    replies: [
      { author: 'petra', hoursAfter: 11, message: 'Old radios is a great forum topic. Is it public?' },
      { author: 'mira', hoursAfter: 14, message: 'Public to read, members to post. Turns out that is most of the spam problem solved.' },
    ],
  },
  {
    forum: 'introductions',
    author: 'newcomer',
    title: 'Just found this, working out if it fits',
    daysAgo: 3,
    message: [
      'Hi. I help run a regional makers group — currently a chat server, which is lovely for the twelve people who are online at 9pm and useless for everyone else. Nothing we say is findable a week later.',
      '',
      'Is this the sort of thing you would move a chat community onto, or is that a known bad idea?',
    ].join('\n'),
    replies: [
      {
        author: 'niamh',
        hoursAfter: 5,
        message:
          'It is a known *hard* idea rather than a bad one. The thing that decides it is whether anyone in the group wants to write posts rather than messages. If two or three people do, a forum works. If nobody does, it will be quiet and you will blame the software.',
      },
      {
        author: 'rosa',
        hoursAfter: 9,
        message:
          'Seconding that. What worked for us was not migrating the chat — we left it running and started the forum for the things worth keeping. The chat got quieter on its own over about a year.',
      },
      { author: 'newcomer', hoursAfter: 26, message: 'That is more useful than what I asked for, thanks. Will try it alongside.' },
    ],
  },

  // ── Help and support ───────────────────────────────────────────────────────
  {
    forum: 'support',
    author: 'petra',
    title: 'Search finds nothing after restoring a backup',
    daysAgo: 34,
    message: [
      'Restored a dump onto a new server last night. Everything is there — threads, posts, members — but search returns nothing at all for terms I can see on the page with my own eyes.',
      '',
      'No errors in the log. Board is otherwise completely normal.',
    ].join('\n'),
    replies: [
      {
        author: 'niamh',
        hoursAfter: 1,
        message:
          'The search column is written per post, and `pg_dump` will happily carry the rows without it depending on how the dump was taken. Run the reindex task and it will backfill:\n\n```sh\ncommunity search:reindex\n```\n\nIt is resumable, so a big board can be done across a few runs.',
      },
      { author: 'petra', hoursAfter: 2, message: 'That was it. 12 minutes for 90k posts and everything is findable again. Thank you.' },
      {
        author: 'admin',
        hoursAfter: 20,
        message:
          'Marking this one for the docs — it comes up every few months and the symptom does not obviously point at the cause.',
      },
    ],
  },
  {
    forum: 'support',
    author: 'sam',
    title: 'Members getting logged out every few hours',
    daysAgo: 12,
    message: [
      'Three or four people have said they get logged out during the day. I cannot reproduce it on my own account. Nothing in the logs that looks related.',
      '',
      'Running two web containers behind the panel proxy, if that matters.',
    ].join('\n'),
    replies: [
      {
        author: 'ada',
        hoursAfter: 1,
        message: 'Two containers is almost certainly it. Do both have the same `AUTH_SECRET`?',
      },
      { author: 'sam', hoursAfter: 2, message: 'Ah. No. They do not.' },
      {
        author: 'ada',
        hoursAfter: 2,
        message:
          'There it is. A session signed by one is unreadable to the other, so every request that lands on the wrong container looks like a stranger. Same secret on both, redeploy, and it goes away.',
      },
      { author: 'sam', hoursAfter: 4, message: 'Fixed. Sorry — that was in the deployment docs and I skimmed it.' },
      {
        author: 'niamh',
        hoursAfter: 6,
        message:
          'Everyone skims it. The failure mode is confusing enough that it is worth the thread existing for the next person searching "logged out randomly".',
      },
    ],
  },
  {
    forum: 'support',
    author: 'olu',
    title: 'Attachments upload but do not appear',
    daysAgo: 6,
    message: [
      'Upload goes through, progress bar completes, post saves — and the attachment is not on the post. It is in the uploads directory on disk.',
      '',
      'Started after I moved the board to a bigger server last week.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 3,
        message:
          'Attachments are processed by the background tick rather than during the request, so this is usually the worker not running rather than the upload failing. What does the tasks screen in the admin panel say the last run was?',
      },
      { author: 'olu', hoursAfter: 8, message: 'It says never. The worker container is not in my new compose file at all.' },
      { author: 'admin', hoursAfter: 9, message: 'That will do it. Add it back and the queued ones will process on the next tick — nothing is lost.' },
      { author: 'olu', hoursAfter: 27, message: 'All 60-odd of them appeared within a minute. Thanks.' },
    ],
  },
  {
    forum: 'support',
    author: 'dev',
    title: 'Is there a way to stop a specific member starting new threads?',
    daysAgo: 2,
    message: [
      'Without banning them. One person posts constantly, is not breaking any rule, and starts six threads a day where one would do. I would like them to be able to reply and not to open.',
    ].join('\n'),
    replies: [
      {
        author: 'moderator',
        hoursAfter: 2,
        message:
          'Put them in a group of their own with `canPostThreads` off and `canPostReplies` on. Group permissions resolve per forum, so you can even do it in the one forum where it is a problem and leave them alone everywhere else.',
      },
      { author: 'dev', hoursAfter: 4, message: 'Did not know it went per forum. That is exactly the shape of the problem, thank you.' },
    ],
  },

  // ── Hosting and deployment ─────────────────────────────────────────────────
  {
    forum: 'hosting',
    author: 'tomas',
    title: 'What is everyone actually paying?',
    daysAgo: 122,
    poll: {
      question: 'Monthly hosting bill for your board',
      options: [
        { label: 'Under €5', voters: ['mira', 'sam'] },
        { label: '€5–15', voters: ['tomas', 'petra', 'dev', 'olu', 'member'] },
        { label: '€15–40', voters: ['ken', 'ada', 'niamh'] },
        { label: '€40–100', voters: ['rosa'] },
        { label: 'Over €100', voters: [] },
      ],
      closesInDays: null,
    },
    message: [
      'Curious where people land. Include the database and backups, exclude the domain — everyone has a domain.',
      '',
      'I am at about €12 for a board with 400 members and 90k posts, on a small VPS with the database on the same box. It has never been the bottleneck.',
    ].join('\n'),
    replies: [
      {
        author: 'mira',
        hoursAfter: 3,
        message: 'Under €5 here, on the smallest instance the provider sells. Forty members. It idles.',
      },
      {
        author: 'rosa',
        hoursAfter: 8,
        message:
          '€38, and about a third of that is object storage for attachments. Ten years of photo threads adds up faster than the posts do.',
      },
      {
        author: 'ken',
        hoursAfter: 22,
        message:
          'Worth saying for anyone reading this while deciding: the cost that matters is not the server, it is whether you will still care in three years. The server is a rounding error next to that.',
      },
      { author: 'tomas', hoursAfter: 27, message: 'That is the truest thing in the thread and it is not what I asked. Fair enough.' },
    ],
  },
  {
    forum: 'hosting',
    author: 'ken',
    title: 'Backups: what I do, and what I got wrong for a year',
    daysAgo: 76,
    message: [
      'Wrote this up because I got it wrong for a year and nobody told me.',
      '',
      'What I had: a nightly `pg_dump` to the same disk the database is on. That is not a backup. That is a second copy of a file that dies with the disk.',
      '',
      'What I have now:',
      '',
      '1. Nightly dump, pushed off the box to storage on a different provider.',
      '2. The uploads directory in the same job — attachments are not in the database and a database-only backup restores a board full of broken images.',
      '3. **A restore, every quarter, onto a scratch server.** This is the one everybody skips. My dumps were fine for a year and my restore procedure was wrong, and I would not have known until it mattered.',
      '',
      'The third one took an afternoon to work out and I would not run a board without it now.',
    ].join('\n'),
    replies: [
      { author: 'niamh', hoursAfter: 5, message: 'The quarterly restore is the whole post. Everything else is well known and that one is not.' },
      {
        author: 'petra',
        hoursAfter: 31,
        message: 'This thread is why I found my search-index problem on a scratch server instead of on the day I needed it. Thanks for writing it.',
      },
      { author: 'mira', hoursAfter: 96, message: 'Stealing the uploads point. I genuinely had not thought about it.' },
    ],
  },
  {
    forum: 'hosting',
    author: 'admin',
    title: 'Postgres connection limits, and why the pool default is small',
    daysAgo: 48,
    message: [
      'This comes up enough to be worth a thread.',
      '',
      'The pool defaults to three connections per process. That looks stingy until you count: two web containers, a worker, and a migration one-shot is four processes, and a managed Postgres on a small plan often caps you at 20-25 connections total. A pool of ten per process exhausts that before you have any traffic at all.',
      '',
      'If you are running behind a transaction-mode pooler, keep the pool small and let the pooler do the multiplexing. That is what it is for.',
    ].join('\n'),
    replies: [
      {
        author: 'tomas',
        hoursAfter: 12,
        message: 'This is the thing that bit me during the 0.1.0 reindex. Small pool plus a reindex plus normal traffic is still more than a tiny plan has.',
      },
    ],
  },

  // ── Moderation ─────────────────────────────────────────────────────────────
  {
    forum: 'moderation',
    author: 'niamh',
    title: 'The spam wave last month, and what stopped it',
    daysAgo: 57,
    message: [
      'We took about 900 registration attempts over four days. Roughly 30 got through to a post. Here is what did and did not work, since I know a few other boards saw the same wave.',
      '',
      '**Did not work:** the honeypot alone. Whatever was driving it filled the form like a browser because it *was* a browser.',
      '',
      '**Worked:** the registration question. One line, specific to the board, that you cannot answer by reading the page — ours asks what the group was called before it was renamed. Attempts went from ~200 a day to under five.',
      '',
      '**Also worked, quietly:** holding first posts for approval. Even the ones that got through never became visible, so the board never looked spammed, which matters more than the raw numbers.',
      '',
      'Cost of all this to real people: two members emailed to say the question was confusing. Both got in.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 4,
        message:
          'The "board never looked spammed" point is underrated. A board that looks unmoderated attracts more of it, so the queue is doing double duty.',
      },
      { author: 'rosa', hoursAfter: 9, message: 'We had the same wave, same week. Question worked for us too. Ours asks about a local landmark.' },
      {
        author: 'ada',
        hoursAfter: 15,
        message: 'Does the question survive an upgrade? I set one up months ago and have not thought about it since.',
      },
      { author: 'niamh', hoursAfter: 16, message: 'Yes, it is board settings, not config. Nothing to re-do.' },
    ],
  },
  {
    forum: 'moderation',
    author: 'moderator',
    title: 'How do you handle a member who is technically fine and exhausting?',
    daysAgo: 29,
    message: [
      'Not a rule-breaker. Never rude. Replies to every thread within a minute, at length, usually restating what the previous post said.',
      '',
      'Three people have quietly told me they have stopped posting because of it. I have no rule that covers this and I am not sure I want one.',
    ].join('\n'),
    replies: [
      {
        author: 'niamh',
        hoursAfter: 2,
        message:
          'Talk to them. Genuinely — a private message that says "you are one of the most active members here and I need to ask you to leave more room" works more often than the internet expects. I have done it four times and it worked three.',
      },
      {
        author: 'ken',
        hoursAfter: 6,
        quotes: 1,
        message:
          'And the fourth?\n\nAsking seriously — the failure case is the one people never write down, and it is the one I would want to know about before trying this.',
      },
      {
        author: 'niamh',
        hoursAfter: 8,
        message:
          'The fourth left in a huff and posted about it elsewhere. Board was better for it, and I would still do it again. It is not free.',
      },
      { author: 'moderator', hoursAfter: 26, message: 'Sent one this morning. Will report back.' },
      { author: 'moderator', hoursAfter: 74, message: 'Reporting back: went well. They were mortified, which I felt bad about, and have visibly pulled back without going quiet. Recommended.' },
    ],
  },
  {
    forum: 'moderation',
    author: 'spambot',
    title: 'buy cheap watches best price online store',
    daysAgo: 0,
    // Left unapproved on purpose: the moderation queue is a headline feature and
    // an empty queue demonstrates nothing. This is what one looks like.
    visibility: 'unapproved',
    message:
      'best watches replica online store cheap price fast shipping visit our site now for discount http://example.invalid/watches',
  },

  // ── Themes ─────────────────────────────────────────────────────────────────
  {
    forum: 'themes',
    author: 'ada',
    title: 'Iris: a theme with actual whitespace',
    daysAgo: 214,
    message: [
      'Put together a theme for boards that are mostly long posts rather than mostly threads. Wider measure, bigger line height, quieter forum index.',
      '',
      'It fills the same slots as the default — that is the point of the contract — so it drops in and out without touching anything else. Tokens are all overridable from the appearance screen, so you can take the layout and keep your own colours.',
      '',
      'Feedback welcome, particularly from anyone with a board that is genuinely busy. Mine is not and I suspect the index gets worse at scale.',
    ].join('\n'),
    replies: [
      {
        author: 'petra',
        hoursAfter: 20,
        message: 'Running it on ~200 threads a day and the index is fine. The thread view is genuinely nicer to read for long posts.',
      },
      { author: 'ken', hoursAfter: 45, message: 'Small thing: your quote block loses its left border in dark mode. Token is set but the contrast is not there.' },
      { author: 'ada', hoursAfter: 50, message: 'Good catch, fixed. That is what I get for building in light mode.' },
      {
        author: 'mira',
        hoursAfter: 120,
        message: 'Non-developer here — swapped it in from the admin panel in about ten seconds and swapped back to compare. That it is that easy is the surprising part.',
      },
    ],
  },
  {
    forum: 'themes',
    author: 'petra',
    title: 'Can a theme add a slot of its own?',
    daysAgo: 40,
    message: [
      'I want a strip under the header for a rotating notice. Nothing in the slot list is quite it. Can I add one, or am I meant to do this a different way?',
    ].join('\n'),
    replies: [
      {
        author: 'ada',
        hoursAfter: 3,
        message:
          'You cannot, deliberately — the slot list is frozen so a theme keeps rendering across upgrades. A theme that invented slots would be a theme that broke on every release.\n\nWhat you want is a plugin providing the notice and the theme rendering it in an existing slot. The plugin owns the data, the theme owns the look, and neither breaks the other.',
      },
      { author: 'petra', hoursAfter: 5, message: 'That makes sense, and is more work than I hoped. Fine.' },
      {
        author: 'niamh',
        hoursAfter: 9,
        message: 'For what it is worth the announcements feature does roughly this already, if the notice is board-wide rather than rotating.',
      },
      { author: 'petra', hoursAfter: 11, message: 'It is board-wide. I have overcomplicated this. Thank you both.' },
    ],
  },

  // ── Plugins ────────────────────────────────────────────────────────────────
  {
    forum: 'plugins',
    author: 'ken',
    title: 'A plugin that throws should not take the page down — testing that claim',
    daysAgo: 88,
    message: [
      'The docs say a plugin failure is contained. I did not believe it, so I wrote the worst plugin I could and pointed it at a live-ish board.',
      '',
      'Threw synchronously in a render hook: the slot rendered without the plugin, the page was fine, one line in the log naming the plugin and the hook.',
      '',
      'Threw asynchronously after the response: logged, page unaffected, and the plugin was still registered for the next request rather than being silently disabled — which I think is right, though I can see the argument.',
      '',
      'Infinite loop in a hook: this one *did* hang the request, and I do not think there is a way around that short of a worker per plugin. Worth knowing.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 7,
        message:
          'The loop case is real and we should say so plainly in the plugin docs rather than letting "failures are contained" imply more than it means. A hook gets the request thread; if it never gives it back, that request is gone. Opened a docs issue.',
      },
      { author: 'ada', hoursAfter: 14, message: 'Appreciated that you tested it instead of taking the sentence at face value. More of this.' },
      { author: 'dev', hoursAfter: 60, message: 'Is there a timeout you can put around a hook, or does that break the sync ones?' },
      {
        author: 'ken',
        hoursAfter: 66,
        message: 'Breaks the sync ones — you cannot interrupt synchronous JavaScript from outside. Async hooks could take one. That may be the honest answer: the sync hooks are the sharp edge.',
      },
    ],
  },
  {
    forum: 'plugins',
    author: 'dev',
    title: 'Hook for "member joined a group"?',
    daysAgo: 17,
    message: [
      'I want to post a line in a forum when someone gets promoted into the veterans group. There is a hook for registration and one for a post being created, but I cannot find one for group membership changing.',
    ].join('\n'),
    replies: [
      { author: 'admin', hoursAfter: 5, message: 'There is not one. Promotions run in the background tick rather than in a request, and no hook fires from the tick today.' },
      { author: 'dev', hoursAfter: 6, message: 'Is that a "no" or a "not yet"?' },
      {
        author: 'admin',
        hoursAfter: 8,
        message:
          'Not yet, and it needs thinking about rather than adding — a hook that fires from the tick has no request, no actor, and no page to fail into, so the containment story is different. Worth an issue if you want to write down the use case.',
      },
    ],
  },

  // ── Anything else ──────────────────────────────────────────────────────────
  {
    forum: 'offtopic',
    author: 'mira',
    title: 'What did your community exist as before it was a forum?',
    daysAgo: 63,
    message: [
      'Ours was a mailing list, then a chat server, then nothing for about two years, and now this. The two years of nothing lost more people than either move did.',
      '',
      'Curious what everyone else came from.',
    ].join('\n'),
    replies: [
      { author: 'rosa', hoursAfter: 2, message: 'A hosted forum, and before that a different hosted forum. We have never not been a forum. Twenty-one years.' },
      { author: 'tomas', hoursAfter: 4, message: 'A spreadsheet. Genuinely. Ride signups in a shared spreadsheet with a comments column that became a discussion.' },
      { author: 'ken', hoursAfter: 6, message: 'A spreadsheet is a beautiful answer.' },
      { author: 'sam', hoursAfter: 13, message: 'Facebook group. Left after the third time a post about a meetup was shown to nine people.' },
      {
        author: 'niamh',
        hoursAfter: 25,
        message: 'The two-years-of-nothing detail is the one I would highlight. Communities do not usually die of a bad platform, they die of a gap.',
      },
    ],
  },
  {
    forum: 'offtopic',
    author: 'olu',
    title: 'Small thing that made members happier than any feature',
    daysAgo: 9,
    message: [
      'Changed the default sort on the index so the forum with the most recent post comes first, rather than the fixed order.',
      '',
      'Three people said unprompted that the board "feels more alive". Nothing was added. Nothing was faster. It just stopped showing the quiet forum first.',
    ].join('\n'),
    replies: [
      { author: 'ada', hoursAfter: 4, message: 'This is genuinely half of design and nobody believes it until they try it.' },
      { author: 'petra', hoursAfter: 30, message: 'Doing this tonight.' },
      {
        // Visible, and reported. The held post above shows the queue catching
        // one; this shows the other half of the job — the one that got through,
        // and the member who flagged it.
        author: 'spambot',
        hoursAfter: 213,
        message:
          'nice post!! also check best replica watches lowest price fast shipping worldwide http://example.invalid/watches',
      },
    ],
  },
]

/** Reputation given on posts, so profiles and post footers are not all zeroes. */
export interface DemoThanks {
  readonly threadTitle: string
  /** 0 is the opening post, 1 the first reply, and so on. */
  readonly postIndex: number
  readonly from: readonly string[]
}

export const DEMO_THANKS: readonly DemoThanks[] = [
  { threadTitle: 'Backups: what I do, and what I got wrong for a year', postIndex: 0, from: ['niamh', 'petra', 'mira', 'admin', 'rosa', 'tomas'] },
  { threadTitle: 'The spam wave last month, and what stopped it', postIndex: 0, from: ['admin', 'rosa', 'moderator', 'ada'] },
  { threadTitle: 'Members getting logged out every few hours', postIndex: 1, from: ['sam', 'niamh', 'dev'] },
  { threadTitle: 'Search finds nothing after restoring a backup', postIndex: 1, from: ['petra', 'admin'] },
  { threadTitle: 'A plugin that throws should not take the page down — testing that claim', postIndex: 0, from: ['admin', 'ada', 'dev'] },
  { threadTitle: 'How do you handle a member who is technically fine and exhausting?', postIndex: 1, from: ['moderator', 'ken'] },
  { threadTitle: 'Hello — moved 40k posts last spring', postIndex: 2, from: ['ken', 'dev'] },
  { threadTitle: 'Iris: a theme with actual whitespace', postIndex: 0, from: ['petra', 'mira', 'ken'] },
]

/** Private messages, so the admin's inbox is not empty on first login. */
export interface DemoMessage {
  readonly from: string
  readonly to: readonly string[]
  readonly subject: string
  readonly message: string
  readonly daysAgo: number
}

export const DEMO_MESSAGES: readonly DemoMessage[] = [
  {
    from: 'niamh',
    to: ['admin'],
    subject: 'Reports queue before you go',
    daysAgo: 1,
    message:
      'There is one open report on a post in Moderation — the watches thread. I have left it for you rather than acting on it, since you wanted to see how the queue reads before we change the wording.',
  },
  {
    from: 'moderator',
    to: ['admin'],
    subject: 'That member I messaged',
    daysAgo: 2,
    message:
      'Followed your advice and it went fine, wrote it up in the thread. One thing I would change: I sent it at 11pm and then could not sleep waiting for the reply. Send those in the morning.',
  },
  {
    from: 'rosa',
    to: ['admin', 'niamh'],
    subject: 'Migration write-up — worth a sticky?',
    daysAgo: 5,
    message:
      'Happy to expand my introduction post into a proper walkthrough of the import if you think it would get read. Would want someone to check the bits about attachments, since that is where I was guessing.',
  },
]

/** Open reports, so the moderation queue has something in it. */
export interface DemoReport {
  readonly reporter: string
  readonly threadTitle: string
  readonly postIndex: number
  readonly reason: string
  readonly hoursAgo: number
}

export const DEMO_REPORTS: readonly DemoReport[] = [
  {
    reporter: 'member',
    threadTitle: 'Small thing that made members happier than any feature',
    postIndex: 3,
    reason: 'Spam — link to an off-site shop, account registered today.',
    hoursAgo: 4,
  },
]
