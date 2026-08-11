import type { Board, Loss } from "./site"
import { licenceHref, site } from "./site"

/*
 * ── One page per audience ─────────────────────────────────────────────────
 *
 * The general page makes the case that is true of everybody: the group chat
 * forgets, somebody else decides who sees what, half your people are not on
 * it, and none of it is yours. That argument is sound and it is also, on its
 * own, an argument nobody searches for.
 *
 * What people search for is their own situation. "Forum for a GAA club" and
 * "Discord alternative that keeps history" are different intents that want
 * different words, different examples and different proof — and one page
 * cannot rank for both, or speak to both without hedging into mush. So each
 * audience gets a page at a URL of its own, which can be linked in a
 * committee email, pinned in a server, or pointed at by an advert.
 *
 * Every segment page is a whole landing page rather than a teaser. Somebody
 * arriving cold from a search should never have to go to the general page to
 * find out what this is, so the shared bands — what it costs, who runs it,
 * the licence — appear on all of them. What changes is the half that is
 * actually about the reader: their headline, their board, their four
 * complaints in their own words, the one feature that matters most to them,
 * and an honest account of what moving from *their* platform involves.
 *
 * Adding a segment is one entry here. The route, the sitemap, the chooser on
 * the general page and the metadata all follow from it.
 */

export type SegmentLink =
  | { readonly label: string; readonly doc: string }
  | { readonly label: string; readonly href: string }

export interface SegmentFeature {
  readonly eyebrow: string
  readonly heading: string
  readonly lede: string
  readonly points: readonly { readonly title: string; readonly body: string }[]
  readonly emphasis: string
  readonly links: readonly SegmentLink[]
}

export interface Segment {
  readonly slug: string
  /** How this audience is named in the chooser, the header of the page and the breadcrumb. */
  readonly name: string
  /**
   * The name mid-sentence, as in "Meith for …". Declared rather than
   * lower-cased from `name`, because English does not lower-case by rule
   * once proper nouns are involved: "discord & slack communities" is wrong
   * in a way "sports clubs" is not.
   */
  readonly lowerName: string
  /** The one line under the name in the chooser on the general page. */
  readonly chooserLine: string
  /**
   * Under the board preview. Written out rather than derived from `name`,
   * because the names do not singularise by any rule worth writing:
   * "Discord & Slack communities" would come back as "communitie".
   */
  readonly boardCaption: string
  readonly meta: { readonly title: string; readonly description: string }
  readonly hero: {
    readonly badge: string
    readonly headline: { readonly before: string; readonly emphasis: string }
    readonly lede: string
  }
  readonly board: Board
  readonly losses: readonly Loss[]
  readonly capabilities: {
    readonly eyebrow: string
    readonly heading: string
    readonly lede: string
    /** Capability ids from src/content/site.ts, in the order this audience cares about them. */
    readonly ids: readonly string[]
  }
  readonly feature: SegmentFeature
  readonly origin: {
    readonly eyebrow: string
    readonly heading: string
    readonly body: string
    readonly emphasis: string
  }
  readonly closing: { readonly heading: string; readonly body: string }
}

const duesHref = `${site.repository}/tree/main/plugins/dues`

export const segments: readonly [Segment, ...Segment[]] = [
  {
    slug: "clubs",
    boardCaption:
      "A club's board, in outline — its forums, what is in them, and the last thing said.",
    name: "Sports clubs",
    lowerName: "sports clubs",
    chooserLine:
      "Fixtures, notices, subs and a committee room — for GAA, soccer, and any club run by " +
      "volunteers in their own time.",
    meta: {
      title: "Meith for sports clubs — fixtures, notices and membership in one place",
      description:
        "A place of your own for your club: fixtures that stay put, notices that reach the " +
        "whole club, a private committee room, and membership taken online through Stripe. " +
        "Free and open source, on your own server, with no per-member pricing.",
    },
    hero: {
      badge: "For GAA clubs, soccer clubs, and everything run by a committee",
      headline: { before: "The fixture changed.", emphasis: "Did everybody see it?" },
      lede:
        "Between the WhatsApp group, the Facebook page and the members who are on neither, a " +
        "club spends half its energy telling people the same thing three times. Meith gives " +
        "your club one place everybody can reach — fixtures that stay put, notices that " +
        "arrive, a committee room nobody else can read, and the subs taken online.",
    },
    board: {
      name: "Cloonbeg GAA",
      kind: "club board",
      forums: [
        {
          title: "Fixtures & results",
          blurb: "Who's playing, and how it went.",
          threads: 412,
          posts: 3_820,
        },
        { title: "Club notices", blurb: "Registration, lotto, the AGM.", threads: 188, posts: 1_104 },
        {
          title: "Juvenile section",
          blurb: "Coaches, parents, arrangements.",
          threads: 356,
          posts: 4_291,
        },
        {
          title: "Committee",
          blurb: "Minutes, accounts, decisions.",
          threads: 74,
          posts: 902,
          private: true,
        },
      ],
      latest: { thread: "U14 match moved to Saturday, 11am", when: "12 min ago" },
    },
    losses: [
      {
        complaint: "I sent it three times and they still went to the wrong pitch.",
        answer:
          "A notice on a board is not competing with anything. It stays in the forum you put it " +
          "in, it is still there on Saturday morning, and it can go out by email to the whole " +
          "club at once — including the members who never open the app.",
      },
      {
        complaint: "The subs are a spreadsheet and a shoebox.",
        answer:
          "Take membership online and let it look after itself. A member pays, the members' " +
          "area opens for them, and the whole thing lapses on its own when the year is up. " +
          "Nobody sits down with a list in January.",
      },
      {
        complaint: "Half the club isn't on Facebook, and never will be.",
        answer:
          "Your board is a link. A member opens it in the browser they already have — no " +
          "account with any company, no app to install, and no parent shut out of the juvenile " +
          "section because they will not sign up to something.",
      },
      {
        complaint: "Nobody can find the minutes from March.",
        answer:
          "Every decision is a thread, in a forum only the committee can see, and search goes " +
          "back through all of it. Next year's officers inherit the answers instead of the " +
          "questions.",
      },
    ],
    capabilities: {
      eyebrow: "What your club gets",
      heading: "Built for a committee, not for a support desk.",
      lede:
        "Four of the things a club notices in the first week. Each is also a link, because the " +
        "page asserts and the document argues.",
      ids: ["permissions", "spam", "themes", "search"],
    },
    feature: {
      eyebrow: "Membership",
      heading: "Take the subs online, and stop chasing them.",
      lede:
        "Dues comes with the software: membership sold through Stripe, as a monthly or yearly " +
        "subscription, a pass from a day to two years, or a lifetime. You set the plans in the " +
        "panel — name, price, currency, length — and a member can buy one for themselves or " +
        "gift one to somebody by name.",
      points: [
        {
          title: "Paying opens the door by itself",
          body:
            "A paid membership puts that person in a group, and the group is what carries the " +
            "members-only forum, the badge, the name colour. Nobody chases a spreadsheet, and " +
            "nobody is added by hand.",
        },
        {
          title: "It lapses without being watched",
          body:
            "Every membership runs out on its own. Remove the plugin, stop its tasks, or lose " +
            "the Stripe account entirely, and each one drains away at its own boundary — the " +
            "board is left correct rather than left open.",
        },
      ],
      emphasis:
        "And the money is between your club and Stripe. There is no cut, no platform in the " +
        "middle, and no per-member fee at any point.",
      links: [
        { label: "How plugins work", doc: "plugin-api" },
        { label: "Read what Dues does", href: duesHref },
      ],
    },
    origin: {
      eyebrow: "Coming from WhatsApp and Facebook",
      heading: "Keep them. Move what matters.",
      body:
        "There is no clean way to get a club's history out of a WhatsApp group or a Facebook " +
        "page, and that is their decision rather than ours. In practice it matters less than " +
        "it sounds: most clubs start the board fresh, put this season's fixtures and the " +
        "current notices on it, and carry across the handful of things that were always worth " +
        "keeping.",
      emphasis:
        "And the group chat carries on. It is good at lifts and last-minute changes. It was " +
        "never any good at being the place you go to look something up.",
    },
    closing: {
      heading: "Give your club one place everybody can reach.",
      body:
        "At your own address, on a machine of your own, in about half an hour. Have a look at " +
        "a real board first — and read the source before you run it.",
    },
  },

  {
    slug: "neighbourhoods",
    boardCaption:
      "A residents' association's board, in outline — its forums, what is in them, and the last thing said.",
    name: "Residents' associations",
    lowerName: "residents' associations",
    chooserLine:
      "A noticeboard the whole road can reach — including the neighbours who will not go near " +
      "Facebook.",
    meta: {
      title: "Meith for residents' associations — a noticeboard the whole road can reach",
      description:
        "A noticeboard your neighbourhood owns: collections and roadworks that do not scroll " +
        "away, readable without an account of any kind, with a private committee room for the " +
        "accounts. Free and open source, and it outlives the committee that set it up.",
    },
    hero: {
      badge: "For residents' associations, tenants' groups and neighbourhood committees",
      headline: { before: "Not everyone is on the app.", emphasis: "They still live here." },
      lede:
        "A residents' association does not get to choose its members — everybody on the road " +
        "is one, whether they use Facebook or not. Meith gives your neighbourhood a " +
        "noticeboard anybody can reach with a link: collections and roadworks that do not " +
        "scroll away, a committee room for the accounts, and nothing ranked by an algorithm.",
    },
    board: {
      name: "Elmfield Residents",
      kind: "local board",
      forums: [
        {
          title: "Noticeboard",
          blurb: "Roadworks, collections, meetings.",
          threads: 421,
          posts: 2_266,
        },
        {
          title: "Ask a neighbour",
          blurb: "Recommendations and lost cats.",
          threads: 1_188,
          posts: 7_940,
        },
        { title: "Buy, sell, give away", blurb: "Free to a good home.", threads: 655, posts: 3_104 },
        {
          title: "Committee",
          blurb: "Accounts and correspondence.",
          threads: 88,
          posts: 610,
          private: true,
        },
      ],
      latest: { thread: "Bin collection moved to Wednesday", when: "1 hr ago" },
    },
    losses: [
      {
        complaint: "It's on Facebook, and half the road won't go near it.",
        answer:
          "A board is a link you can put through a letterbox. Anybody can read the public " +
          "forums with no account of any kind, and joining takes an email address — a much " +
          "easier thing to ask of a neighbour than a Facebook account.",
      },
      {
        complaint: "The bin notice was three days ago. It's gone.",
        answer:
          "A notice stays in the forum you put it in until somebody moves it. Nothing is " +
          "ranked, nothing hides behind “see more”, and it can go out by email so it reaches " +
          "the people who would never think to look.",
      },
      {
        complaint: "Somebody asks the same question every spring.",
        answer:
          "Threads stay where they were put, and search reaches back through all of them. The " +
          "answer about the management company from two years ago is still the answer, and " +
          "whoever asks can find it without asking.",
      },
      {
        complaint: "Who actually owns that group?",
        answer:
          "Whoever made the Facebook group owns it, and takes it with them when they move away " +
          "or fall out with the committee. A board belongs to the association: your domain, " +
          "your database, your list, handed on with the rest of the paperwork.",
      },
    ],
    capabilities: {
      eyebrow: "What the association gets",
      heading: "A noticeboard, and the room behind it.",
      lede:
        "Four of the things that matter when the membership is everybody on the road rather " +
        "than everybody who signed up. Each is also a link to the document that argues it.",
      ids: ["permissions", "search", "spam", "themes"],
    },
    feature: {
      eyebrow: "The thing nobody thinks about until it happens",
      heading: "It outlives the committee that set it up.",
      lede:
        "Every residents' group has heard the story: the person who made the group moves away, " +
        "or falls out with the committee, and eleven years of the road's business goes with " +
        "them. A Meith board cannot go that way, because none of it sits inside anybody's " +
        "personal account.",
      points: [
        {
          title: "It belongs to the association, not to a member",
          body:
            "The board lives at a domain the association pays for, on a server the association " +
            "rents. Handing it to next year's committee is handing over a password, not asking " +
            "somebody a favour.",
        },
        {
          title: "And it can be handed on whole",
          body:
            "The archive is a database you hold, backups are one command, and the software is " +
            "free software — so a committee that would rather move it elsewhere, or run it " +
            "themselves, is free to do exactly that.",
        },
      ],
      emphasis:
        "Which is worth saying plainly, because it is the only arrangement here where nobody " +
        "can lock the road out of its own noticeboard.",
      links: [
        { label: "The operator handbook", doc: "operating" },
        { label: "Read the licence", href: licenceHref },
      ],
    },
    origin: {
      eyebrow: "Coming from a Facebook group",
      heading: "Start fresh, and put the link through the doors.",
      body:
        "There is no way to export a Facebook group — not the posts, not the members, not the " +
        "photographs. That is Facebook's decision rather than ours, and it is a fair part of " +
        "the reason to leave.",
      emphasis:
        "So most associations start the board fresh and let the two run side by side for a " +
        "season. The neighbours who were never on Facebook tend to arrive first, which is the " +
        "whole point.",
    },
    closing: {
      heading: "Give the road a noticeboard of its own.",
      body:
        "At an address the association owns, on a machine it rents, in about half an hour. " +
        "Have a look at a real board first.",
    },
  },

  {
    slug: "discord-and-slack",
    boardCaption:
      "A community's board, in outline — its forums, what is in them, and the last thing said.",
    name: "Discord & Slack communities",
    lowerName: "Discord & Slack communities",
    chooserLine:
      "Keep the server. Give the answers worth keeping somewhere they will still be next year.",
    meta: {
      title: "Meith for Discord and Slack communities — an archive that outlives the chat",
      description:
        "Keep your server and stop losing the good threads. Permanent URLs, search that goes " +
        "back years, no message limit, and public threads a search engine can actually read. " +
        "Free, open source, and run alongside the chat rather than instead of it.",
    },
    hero: {
      badge: "For communities that already live in chat",
      headline: { before: "Keep the server.", emphasis: "Stop losing the good threads." },
      lede:
        "Nobody is asking you to leave Discord. But the answer somebody wrote out in full on " +
        "Tuesday is unfindable by Thursday, Slack quietly swallows everything past its message " +
        "limit, and none of it is reachable from a search engine. Meith is where the things " +
        "worth keeping go — and the chat carries on exactly as it is.",
    },
    board: {
      name: "The Long Table",
      kind: "community board",
      forums: [
        {
          title: "Introductions",
          blurb: "Say hello once. It stays said.",
          threads: 2_140,
          posts: 9_877,
        },
        {
          title: "Ask the room",
          blurb: "Questions worth a real answer.",
          threads: 5_308,
          posts: 41_290,
        },
        { title: "The archive", blurb: "Pulled out of chat, and kept.", threads: 611, posts: 8_043 },
        {
          title: "Regulars",
          blurb: "For the people who stayed.",
          threads: 903,
          posts: 12_660,
          private: true,
        },
      ],
      latest: { thread: "From #help: the whole CORS answer", when: "6 min ago" },
    },
    losses: [
      {
        complaint: "Somebody answered this last month. I can't find it.",
        answer:
          "Chat search returns a list of messages that mention a word. Board search returns the " +
          "thread that is about your question, ranked ahead of a passing mention of it, and it " +
          "stays quick however far back the archive goes.",
      },
      {
        complaint: "We hit the message limit and lost two years.",
        answer:
          "Nothing here expires and nothing sits behind a plan. The archive is rows in a " +
          "Postgres database on a machine you rent, and the only thing that ever removes a post " +
          "is somebody deciding to.",
      },
      {
        complaint: "The same five questions, every week, forever.",
        answer:
          "Write the answer once, in a thread with an address you can paste. Newcomers find it " +
          "themselves — which a private server can never let them do, however good the answer " +
          "was.",
      },
      {
        complaint: "None of it is on the open web.",
        answer:
          "Every public thread has a permanent URL, renders as plain HTML, and turns up in a " +
          "search engine. A year of good answers stops being invisible and starts bringing you " +
          "people.",
      },
    ],
    capabilities: {
      eyebrow: "What the board adds",
      heading: "The half that chat was never going to do.",
      lede:
        "Four of the things worth having next to a server. Each is also a link, because the " +
        "page asserts and the document argues.",
      ids: ["search", "permissions", "plugins", "chores"],
    },
    feature: {
      eyebrow: "The reason to bother",
      heading: "An archive that is actually findable.",
      lede:
        "This is the whole trade. Chat is unbeatable for the conversation happening right now " +
        "and hopeless at everything after it; a board is the exact opposite. Running both is " +
        "not a compromise — it is the two halves of what a community actually needs.",
      points: [
        {
          title: "A thread has an address",
          body:
            "Every public thread has a permanent URL you can paste into the chat, into a " +
            "README, into a reply. Nothing behind a login, nothing that expires, nothing that " +
            "moves because somebody said something else.",
        },
        {
          title: "And a search engine can read it",
          body:
            "Public forums render as plain HTML, feeds are published as Atom, and there is no " +
            "third-party script in the way. The answers you have already written start doing " +
            "the work of finding you people.",
        },
      ],
      emphasis:
        "Which is the part chat cannot do at any price: a private server is invisible to " +
        "everybody who has not already joined it.",
      links: [
        { label: "How search holds up", doc: "performance" },
        { label: "The API and the CLI", doc: "rest-api" },
      ],
    },
    origin: {
      eyebrow: "Coming from Discord or Slack",
      heading: "You do not need to move anything.",
      body:
        "There is no clean export out of either, and you would not want one — a chat log poured " +
        "into a forum is still a chat log. The communities that do this well start the board " +
        "with the twenty threads that were always worth keeping, and add to it whenever an " +
        "answer in chat turns out to deserve writing down properly.",
      emphasis:
        "The server stays. Nothing about this asks anybody to change where they hang about.",
    },
    closing: {
      heading: "Give the good answers somewhere to live.",
      body:
        "On a machine of your own, at your own address, in about half an hour. Have a look at a " +
        "real board first — and read the source before you run it.",
    },
  },

  {
    slug: "facebook-groups",
    boardCaption:
      "A group's board, in outline — its forums, what is in them, and the last thing said.",
    name: "Facebook groups",
    lowerName: "Facebook groups",
    chooserLine:
      "You built the group. Facebook owns the reach, the members and the archive — and can " +
      "close it tomorrow.",
    meta: {
      title: "Meith for Facebook groups — own the group you built",
      description:
        "No feed deciding who sees your posts, no ads between them, no account required to " +
        "take part, and no group that can vanish overnight. Your domain, your database, your " +
        "members. Free and open source, on your own server.",
    },
    hero: {
      badge: "For groups that would rather not be somebody's product",
      headline: { before: "You built the group.", emphasis: "Facebook owns it." },
      lede:
        "Your posts reach whoever the feed decides. Your members read ads between them. " +
        "Anybody who has deleted their account cannot take part at all, and if the group is " +
        "ever removed you lose the lot at once — the members, the archive, and every way of " +
        "telling anybody where you went. A place of your own has none of those problems.",
    },
    board: {
      name: "The Allotment",
      kind: "group board",
      forums: [
        { title: "Noticeboard", blurb: "What's on, and what changed.", threads: 268, posts: 1_540 },
        {
          title: "Ask the group",
          blurb: "Questions worth a real answer.",
          threads: 1_904,
          posts: 14_220,
        },
        {
          title: "Show your patch",
          blurb: "Photographs, and how it went.",
          threads: 812,
          posts: 6_338,
        },
        { title: "Moderators", blurb: "The calls, and why.", threads: 96, posts: 744, private: true },
      ],
      latest: { thread: "Blight again — what worked this year", when: "22 min ago" },
    },
    losses: [
      {
        complaint: "Only a fraction of the group ever sees a post.",
        answer:
          "There is no feed here and nothing is ranked. A notice sits in the forum you put it " +
          "in, everybody in the group can see it, and it can go out by email as well. Reach is " +
          "not a thing you have to buy back.",
      },
      {
        complaint: "People who left Facebook can't be in the group.",
        answer:
          "Your board is a link. Anybody can read the public forums with no account of any " +
          "kind, and joining takes an email address — no company in the middle, and nobody " +
          "excluded for having quit one.",
      },
      {
        complaint: "If the group goes, everything goes.",
        answer:
          "A group can be removed overnight, by a report or a mistake, with no appeal that " +
          "reaches a person. Your board is your domain and your database on a machine you " +
          "rent. Backups are one command, and nobody else can switch it off.",
      },
      {
        complaint: "Try finding a post from last spring.",
        answer:
          "Threads stay where they were put, in forums you organised, and search reaches back " +
          "through the whole archive. The group's good posts stop being something you " +
          "half-remember and cannot produce.",
      },
    ],
    capabilities: {
      eyebrow: "What the group gets",
      heading: "The group you thought you already had.",
      lede:
        "Four of the things that change on the first day. Each is also a link, because the " +
        "page asserts and the document argues.",
      ids: ["permissions", "search", "spam", "themes"],
    },
    feature: {
      eyebrow: "What you actually get back",
      heading: "The group, and the list, are yours.",
      lede:
        "The thing a Facebook group never gives you is a way to reach your own members. You " +
        "cannot export them, you cannot email them, and if the group goes you have no way of " +
        "telling anybody where you went. That is the arrangement, and it is the one worth " +
        "leaving.",
      points: [
        {
          title: "You can reach everybody, directly",
          body:
            "Members join with an email address and the board sends notices to it. Nothing " +
            "depends on somebody happening to open an app, and no ranking sits between you and " +
            "the people who joined on purpose.",
        },
        {
          title: "And you can leave with all of it",
          body:
            "The archive is a database on your own machine. Take a backup, move it to another " +
            "server, or hand the whole thing over to whoever runs the group after you.",
        },
      ],
      emphasis:
        "None of which is really a feature. It is the absence of a landlord.",
      links: [
        { label: "The operator handbook", doc: "operating" },
        { label: "Read the licence", href: licenceHref },
      ],
    },
    origin: {
      eyebrow: "Coming from a Facebook group",
      heading: "Start fresh, and pin the link.",
      body:
        "There is no way to export a Facebook group — not the posts, not the members, not the " +
        "photographs. That is Facebook's decision rather than ours, and it is most of the " +
        "argument for going.",
      emphasis:
        "So run both for a season. Pin the link, let the board fill with the things worth " +
        "keeping, and watch which conversations move on their own. The people who quietly left " +
        "Facebook years ago turn up first.",
    },
    closing: {
      heading: "Own the group you built.",
      body:
        "At your own address, on a machine of your own, in about half an hour. Have a look at " +
        "a real board first.",
    },
  },

  {
    slug: "gaming",
    boardCaption:
      "A clan's board, in outline — its forums, what is in them, and the last thing said.",
    name: "Gaming clans",
    lowerName: "gaming clans",
    chooserLine:
      "Rosters, builds and recruitment that do not scroll up the channel — and something an " +
      "applicant can read before they join.",
    meta: {
      title: "Meith for gaming clans — rosters, builds and recruitment that stay put",
      description:
        "A place for the things that need to still be true next week: the roster, the rules, " +
        "the build guides, and recruitment somebody can read before they apply. A private " +
        "officers' forum for the rest. Free, open source, and it runs alongside your Discord.",
    },
    hero: {
      badge: "For clans, guilds and squads",
      headline: { before: "The raid is Tuesday.", emphasis: "Where is that written down?" },
      lede:
        "Pins fill up. The recruitment post scrolls away. The build that carried you through " +
        "the last tier is somewhere up a channel nobody can search. Meith gives your clan a " +
        "place for the things that need to still be true next week — and your Discord carries " +
        "on doing what it is good at.",
    },
    board: {
      name: "Nightfall",
      kind: "clan board",
      forums: [
        { title: "Raid nights", blurb: "Rosters, times, who's in.", threads: 1_877, posts: 24_310 },
        {
          title: "Builds & loadouts",
          blurb: "What works, and since when.",
          threads: 940,
          posts: 15_602,
        },
        { title: "Recruitment", blurb: "Applications, open to read.", threads: 388, posts: 2_914 },
        {
          title: "Officers",
          blurb: "Calls that need no audience.",
          threads: 156,
          posts: 2_201,
          private: true,
        },
      ],
      latest: { thread: "Tuesday roster — two spots left", when: "8 min ago" },
    },
    losses: [
      {
        complaint: "It's in the pins. There are ninety pins.",
        answer:
          "A pinned message is a bookmark, not a filing system. Here the roster is a thread in " +
          "a forum called Raid nights and the build is a thread in Builds, and neither of them " +
          "moves because somebody said something else.",
      },
      {
        complaint: "Applicants can't see anything until they join.",
        answer:
          "Your public forums are readable by anybody with the link — no account, no invite. " +
          "Somebody deciding whether to apply can read the rules, the raid times and a month of " +
          "activity first, which is the only honest way to recruit.",
      },
      {
        complaint: "That build guide is three months up the channel.",
        answer:
          "Threads stay where they were put and search goes back through all of them. A guide " +
          "written for the last tier is still there when the next one lands, with the date on " +
          "it so you know what it was written against.",
      },
      {
        complaint: "The officers need somewhere that isn't a group DM.",
        answer:
          "A private forum only officers can see: applications discussed, calls made, and the " +
          "reasoning still there for whoever takes over. Nobody has to be added to a DM to " +
          "catch up on two years of it.",
      },
    ],
    capabilities: {
      eyebrow: "What the clan gets",
      heading: "A front door, and a room behind it.",
      lede:
        "Four of the things that matter when half your problem is who can see what. Each is " +
        "also a link, because the page asserts and the document argues.",
      ids: ["permissions", "search", "themes", "plugins"],
    },
    feature: {
      eyebrow: "Recruitment",
      heading: "People can read the place before they join it.",
      lede:
        "This is the thing a private server cannot do at any setting. An invite link shows a " +
        "prospective member nothing at all: they either join blind or they do not join. A board " +
        "lets them read the rules, the schedule and a month of real activity, and then apply.",
      points: [
        {
          title: "The front of the clan is public",
          body:
            "Rules, raid times, what you are looking for, and enough recent activity to prove " +
            "the clan is alive — all of it indexed, and all of it linkable from wherever you " +
            "post the advert.",
        },
        {
          title: "The back of it is not",
          body:
            "Applications can be a forum only officers read and reply in, or one the whole clan " +
            "weighs in on. Who can read, post and reply is decided per forum, so both " +
            "arrangements are the same feature set differently.",
        },
      ],
      emphasis: "And when an officer stands down, none of it leaves with them.",
      links: [
        { label: "How permissions work", doc: "operating" },
        { label: "What plugins can do", doc: "plugin-api" },
      ],
    },
    origin: {
      eyebrow: "Coming from Discord",
      heading: "Keep the server. Obviously.",
      body:
        "Voice is voice and nothing replaces it. There is no clean export out of Discord " +
        "either, and you would not want one — a channel poured into a forum is still a " +
        "channel. Start the board with the things that keep being asked for: the roster, the " +
        "rules, and the two or three build guides everybody links every week.",
      emphasis:
        "Then let it grow whenever somebody says something in chat that ought to have been " +
        "written down.",
    },
    closing: {
      heading: "Give the clan somewhere the roster stays put.",
      body:
        "On a machine of your own, at your own address, in about half an hour. Have a look at a " +
        "real board first.",
    },
  },
]

export function findSegment(slug: string): Segment | undefined {
  return segments.find((segment) => segment.slug === slug)
}

export function segmentHref(slug: string): string {
  return `/for/${slug}`
}
