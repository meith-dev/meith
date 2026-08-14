import { licenceHref, site } from "./site"

/*
 * ── One page per audience ─────────────────────────────────────────────────
 *
 * The general page says what the thing is. These say why it is about you.
 *
 * "Forum for a GAA club" and "Discord alternative that keeps history" are
 * different intents that want different words and different examples, and one
 * page cannot rank for both or speak to both without hedging into mush. So
 * each audience gets a URL of its own, which can be linked in a committee
 * email, pinned in a server, or pointed at by an advert.
 *
 * ── What these pages used to be ───────────────────────────────────────────
 *
 * Sixteen hundred rendered words each, of which about eleven hundred were the
 * same on all five: the deployment routes, the cost note, the licence
 * explainer, the performance band and the migration note, repeated verbatim
 * six times across the site. The argument for that was that somebody arriving
 * cold from a search should not have to go to the general page to find out
 * what this costs — which is true, and is now served by a strip of thirty
 * words and a link, because the general page is one click away and is itself
 * only five hundred words long.
 *
 * What is left is the half that was ever actually about the reader: their
 * headline, their four complaints in their own words, the one feature that is
 * the argument for them specifically, and the board in a theme that suits
 * them. Roughly two hundred words each.
 *
 * Three things went with the cut and are worth naming, so nobody adds them
 * back by accident:
 *
 *   - `capabilities`, which let a segment pick four of the six cards from the
 *     general page and reorder them. Six cards on one page is a summary; four
 *     of the same six on five more pages is the same summary five more times.
 *   - `origin`, five paragraphs that all said "there is no clean export, start
 *     fresh and run both for a season". One shared line does it.
 *   - `feature.points` and `feature.emphasis`, which turned a two-sentence
 *     argument into a six-sentence one.
 *
 * Adding a segment is still one entry here. The route, the sitemap, the
 * chooser on the general page and the metadata all follow from it.
 */

export interface Loss {
  readonly complaint: string
  /** One sentence. It used to be three, and the third was never the good one. */
  readonly answer: string
}

export type SegmentLink =
  | { readonly label: string; readonly doc: string }
  | { readonly label: string; readonly href: string }

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
   * The theme this audience is shown the board in, by key. A club sees
   * Clubhouse and a clan sees Raidframe, because a screenshot that looks like
   * it was made for somebody else is worse than no screenshot.
   */
  readonly theme: string
  /** Under the board shot, naming whose board it is. */
  readonly boardCaption: string
  readonly meta: { readonly title: string; readonly description: string }
  readonly hero: {
    readonly badge: string
    readonly headline: { readonly before: string; readonly emphasis: string }
    readonly lede: string
  }
  readonly losses: readonly Loss[]
  readonly feature: {
    readonly eyebrow: string
    readonly heading: string
    readonly lede: string
    readonly links: readonly SegmentLink[]
  }
  readonly closing: { readonly heading: string; readonly body: string }
}

const duesHref = `${site.repository}/tree/main/plugins/dues`

/*
 * The one paragraph that used to be five. Every platform on the list is a
 * platform you cannot get your history out of, and saying so once is more
 * convincing than saying it five times in five accents.
 */
export const origin = {
  heading: "Coming from somewhere else?",
  body:
    "There is no clean way out of a Facebook group, a Discord server or a Slack. Most " +
    "communities start fresh, run both for a season, and move what was worth keeping. A MyBB " +
    "board imports whole.",
  link: "What moving involves",
} as const

export const segments: readonly [Segment, ...Segment[]] = [
  {
    slug: "clubs",
    theme: "clubhouse",
    boardCaption: "A club's board, in the Clubhouse theme.",
    name: "Sports clubs",
    lowerName: "sports clubs",
    chooserLine:
      "Fixtures, notices, subs and a committee room, for any club run by volunteers.",
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
    losses: [
      {
        complaint: "I sent it three times and they still went to the wrong pitch.",
        answer:
          "A notice stays in the forum you put it in, is still there on Saturday morning, and " +
          "can go out by email to the whole club at once.",
      },
      {
        complaint: "The subs are a spreadsheet and a shoebox.",
        answer:
          "A member pays, the members' area opens for them, and the whole thing lapses on its " +
          "own when the year is up.",
      },
      {
        complaint: "Half the club isn't on Facebook, and never will be.",
        answer:
          "Your board is a link — no account with any company, no app, and no parent shut out " +
          "of the juvenile section.",
      },
      {
        complaint: "Nobody can find the minutes from March.",
        answer:
          "Every decision is a thread in a forum only the committee can see, and search goes " +
          "back through all of it.",
      },
    ],
    feature: {
      eyebrow: "Membership",
      heading: "Take the subs online, and stop chasing them.",
      lede:
        "Dues comes with the software: membership sold through Stripe as a subscription, a pass " +
        "or a lifetime, with the plans set in your own panel. Paying opens the members-only " +
        "forum by itself, and the money is between your club and Stripe — no cut, and no " +
        "per-member fee at any point.",
      links: [
        { label: "Read what Dues does", href: duesHref },
        { label: "How plugins work", doc: "plugin-api" },
      ],
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
    theme: "default",
    boardCaption: "A residents' association's board, in the default theme.",
    name: "Residents' associations",
    lowerName: "residents' associations",
    chooserLine:
      "A noticeboard the whole road can reach, including the neighbours who avoid Facebook.",
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
    losses: [
      {
        complaint: "It's on Facebook, and half the road won't go near it.",
        answer:
          "Anybody can read the public forums with no account of any kind, and joining takes an " +
          "email address rather than a Facebook account.",
      },
      {
        complaint: "The bin notice was three days ago. It's gone.",
        answer:
          "A notice stays where you put it until somebody moves it — nothing is ranked, and " +
          "nothing hides behind “see more”.",
      },
      {
        complaint: "Somebody asks the same question every spring.",
        answer:
          "Search reaches back through every thread, so the answer about the management company " +
          "from two years ago is still the answer.",
      },
      {
        complaint: "Who actually owns that group?",
        answer:
          "The board belongs to the association — your domain, your database, handed on with " +
          "the rest of the paperwork.",
      },
    ],
    feature: {
      eyebrow: "The thing nobody thinks about until it happens",
      heading: "It outlives the committee that set it up.",
      lede:
        "Every residents' group has heard the story: the person who made the group moves away, " +
        "and eleven years of the road's business goes with them. A Meith board cannot go that " +
        "way, because none of it sits inside anybody's personal account — it is a domain the " +
        "association pays for and a database it holds, handed over with a password.",
      links: [
        { label: "The operator handbook", doc: "operating" },
        { label: "Read the licence", href: licenceHref },
      ],
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
    theme: "midnight",
    boardCaption: "A community's board, in the Midnight theme.",
    name: "Discord & Slack communities",
    lowerName: "Discord & Slack communities",
    chooserLine:
      "Keep the server. Give the good answers somewhere they will still be next year.",
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
    losses: [
      {
        complaint: "Somebody answered this last month. I can't find it.",
        answer:
          "Board search returns the thread that is about your question, ranked ahead of a " +
          "passing mention of it, however far back it goes.",
      },
      {
        complaint: "We hit the message limit and lost two years.",
        answer:
          "Nothing expires and nothing sits behind a plan — the archive is rows in a database " +
          "on a machine you rent.",
      },
      {
        complaint: "The same five questions, every week, forever.",
        answer:
          "Write the answer once, in a thread with an address you can paste, and newcomers find " +
          "it themselves.",
      },
      {
        complaint: "None of it is on the open web.",
        answer:
          "Every public thread has a permanent URL, renders as plain HTML, and turns up in a " +
          "search engine.",
      },
    ],
    feature: {
      eyebrow: "The reason to bother",
      heading: "An archive that is actually findable.",
      lede:
        "This is the whole trade. Chat is unbeatable for the conversation happening right now " +
        "and hopeless at everything after it; a board is the exact opposite. Running both is " +
        "not a compromise — it is the two halves of what a community actually needs, and only " +
        "one of those halves can be found by somebody who has not already joined.",
      links: [
        { label: "How search holds up", doc: "performance" },
        { label: "The API and the CLI", doc: "rest-api" },
      ],
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
    theme: "phasebook",
    boardCaption: "A group's board, in the Phasebook theme.",
    name: "Facebook groups",
    lowerName: "Facebook groups",
    chooserLine:
      "Facebook owns the reach, the members and the archive — and can close it tomorrow.",
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
    losses: [
      {
        complaint: "Only a fraction of the group ever sees a post.",
        answer:
          "There is no feed and nothing is ranked — everybody in the group can see it, and it " +
          "can go out by email as well.",
      },
      {
        complaint: "People who left Facebook can't be in the group.",
        answer:
          "Anybody can read the public forums with no account of any kind, and joining takes an " +
          "email address.",
      },
      {
        complaint: "If the group goes, everything goes.",
        answer:
          "Your board is your domain and your database on a machine you rent — backups are one " +
          "command, and nobody else can switch it off.",
      },
      {
        complaint: "Try finding a post from last spring.",
        answer:
          "Threads stay in the forums you organised, and search reaches back through the whole " +
          "archive.",
      },
    ],
    feature: {
      eyebrow: "What you actually get back",
      heading: "The group, and the list, are yours.",
      lede:
        "The thing a Facebook group never gives you is a way to reach your own members: you " +
        "cannot export them, you cannot email them, and if the group goes you have no way of " +
        "telling anybody where you went. Here they join with an email address and the board " +
        "sends notices to it. None of which is really a feature — it is the absence of a " +
        "landlord.",
      links: [
        { label: "The operator handbook", doc: "operating" },
        { label: "Read the licence", href: licenceHref },
      ],
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
    theme: "raidframe",
    boardCaption: "A clan's board, in the Raidframe theme.",
    name: "Gaming clans",
    lowerName: "gaming clans",
    chooserLine:
      "Rosters, builds and recruitment that do not scroll up the channel.",
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
    losses: [
      {
        complaint: "It's in the pins. There are ninety pins.",
        answer:
          "The roster is a thread in a forum called Raid nights, and it does not move because " +
          "somebody said something else.",
      },
      {
        complaint: "Applicants can't see anything until they join.",
        answer:
          "Your public forums are readable by anybody with the link — no account, no invite, " +
          "and nothing taken on trust.",
      },
      {
        complaint: "That build guide is three months up the channel.",
        answer:
          "Threads stay where they were put, with the date on them, so a guide is still there " +
          "when the next tier lands.",
      },
      {
        complaint: "The officers need somewhere that isn't a group DM.",
        answer:
          "A private forum only officers can see, with the reasoning still there for whoever " +
          "takes over.",
      },
    ],
    feature: {
      eyebrow: "Recruitment",
      heading: "People can read the place before they join it.",
      lede:
        "This is the thing a private server cannot do at any setting. An invite link shows a " +
        "prospective member nothing at all: they either join blind or they do not join. A board " +
        "lets them read the rules, the schedule and a month of real activity first — and when " +
        "an officer stands down, none of it leaves with them.",
      links: [
        { label: "How permissions work", doc: "operating" },
        { label: "What plugins can do", doc: "plugin-api" },
      ],
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
