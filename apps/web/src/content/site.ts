import { compact } from "../format"
import type { Facts } from "./facts"

export const site = {
  name: "Meith",
  // What the header shows. `url` is what canonical links, the sitemap and
  // robots.txt are built from, and it has to be the host that answers rather
  // than the one that redirects to it.
  domain: "meith.dev",
  url: "https://www.meith.dev",
  demo: "https://demo.meith.dev",
  repository: "https://github.com/meith-dev/meith",
  tagline: "A place of your own for the things your group chat keeps losing.",
  description:
    "Meith is free, open-source community software you run on your own server. Threads that " +
    "stay put, search that reaches back years, and notices that reach everyone — for clubs, " +
    "Discord and Slack communities, open-source projects, gaming clans and residents' groups. " +
    "No ads, no algorithm, and no per-member pricing.",
} as const

export const installCommand = "git clone https://github.com/meith-dev/meith.git"

export const licence = {
  spdx: "LGPL-3.0-or-later",
  short: "LGPL-3.0",
  name: "GNU Lesser General Public License v3",
  file: "LICENSE.md",
  incorporates: "COPYING",
} as const

export const licenceHref = `${site.repository}/blob/main/${licence.file}`

/*
 * ── Who this page is written for ──────────────────────────────────────────
 *
 * It used to open by naming its own category: "open-source community
 * software". That is a phrase the people this software is for have never
 * searched for. A club secretary has not thought "what we need is community
 * software"; they have thought "I have sent that fixture change three times
 * and people still went to the wrong pitch."
 *
 * So the page now opens on the failure rather than the category, and the
 * failure is chosen because it is the one every platform on the list shares.
 * Discord, Slack, a Facebook group, the club's WhatsApp thread — all of them
 * are rivers, and everything eventually floats past. That is a complaint
 * people have already said out loud, which is the test a headline has to pass.
 *
 * The badge lost "Postgres" and "LGPL-3.0" for the same reason. Both are
 * reassurance for one reader and noise for the other four, and both are still
 * on the page — further down, where the reader who wants them is still reading
 * and the reader who does not has already been convinced.
 */
export const hero = {
  badge: "Free and open source · Your own server · No per-member pricing",
  headline: { before: "The group chat forgets.", emphasis: "Your community shouldn't." },
  lede:
    "A GAA club, a Discord server, an open-source project, a five-a-side league — the same " +
    "thing keeps happening. The fixture change scrolls away. The answer you typed out twice is " +
    "gone. Half the members never saw the post at all. Meith gives your community a place of " +
    "its own, where nothing gets lost and nobody else decides who sees what.",
  primary: "See a live board",
  secondary: "Set one up",
  assurance:
    "No ads, no trackers, and no third-party script between your members and your board. " +
    "Nothing here is priced per member — two hundred of them cost what twenty do.",
} as const

export const terminal: {
  readonly cwd: string
  readonly lines: readonly { readonly text: string; readonly output?: boolean }[]
} = {
  cwd: "~/boards",
  lines: [
    { text: installCommand },
    { text: "cd meith && cp .env.example .env" },
    { text: "docker compose up -d --build" },
    { text: "✔ db        started", output: true },
    { text: "✔ migrate   exited (0)", output: true },
    { text: "✔ web       started", output: true },
    { text: "✔ worker    started", output: true },
    { text: "→ open /install to name the board", output: true },
  ],
}

/*
 * ── The audiences ─────────────────────────────────────────────────────────
 *
 * The preview beside the hero used to show one board, and it was a developer's
 * board: Workshop, with build logs in it. Every visitor who was not a
 * developer had to do the translation themselves, and most of them will not
 * bother.
 *
 * So the preview is now driven by a picker, and each entry is a whole
 * community rendered concretely — its forums, what is in them, and the last
 * thing said. The point is recognition inside two seconds: a club secretary
 * should see "U14 match moved" and stop translating.
 *
 * Two things are deliberate in the data rather than in the copy around it.
 * Every board has exactly one private forum, so the permission model gets
 * demonstrated four times over without the page ever saying "27 fields
 * resolved per actor per forum" — the lock does it. And the post counts are
 * lopsided on purpose: a board where one forum has twenty times the traffic of
 * another is what a real one looks like, and evenly-filled columns read as
 * placeholder.
 *
 * One constraint worth knowing before editing: a blurb is truncated to the
 * width of the preview, which is about thirty-three characters. Write them to
 * fit rather than to the sentence they want to be.
 *
 * Adding a segment is four lines here and nothing anywhere else. Removing one
 * is the same. That is the whole reason this is data.
 */
export interface AudienceForum {
  readonly title: string
  readonly blurb: string
  readonly threads: number
  readonly posts: number
  readonly private?: boolean
}

export interface Audience {
  readonly id: string
  /** What the picker says. Short — these sit on one line together. */
  readonly chip: string
  readonly line: string
  readonly body: string
  readonly board: { readonly name: string; readonly kind: string }
  readonly forums: readonly AudienceForum[]
  readonly latest: { readonly thread: string; readonly when: string }
}

/*
 * A non-empty tuple rather than a plain array, because the picker falls back to
 * the first entry and `noUncheckedIndexedAccess` is right to ask what happens
 * when there isn't one. Saying it in the type means the fallback needs no
 * runtime guard for a case that would be a bug anyway.
 */
export const audiences: readonly [Audience, ...Audience[]] = [
  {
    id: "club",
    chip: "Sports club",
    line: "The fixture change that everybody actually sees.",
    body:
      "Notices that stay put instead of scrolling away, a members' area that opens by itself " +
      "when the subs are paid, and a committee room nobody else can read.",
    board: { name: "Cloonbeg GAA", kind: "club board" },
    forums: [
      {
        title: "Fixtures & results",
        blurb: "Who's playing, and how it went.",
        threads: 412,
        posts: 3_820,
      },
      {
        title: "Club notices",
        blurb: "Registration, lotto, the AGM.",
        threads: 188,
        posts: 1_104,
      },
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
  {
    id: "chat",
    chip: "Discord / Slack",
    line: "Keep the server. Stop losing the good threads.",
    body:
      "The answers worth keeping get a home with an address, a search box and no ninety-day " +
      "horizon — and the chat carries on exactly where it is.",
    board: { name: "The Long Table", kind: "community board" },
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
      {
        title: "The archive",
        blurb: "The threads worth keeping, kept.",
        threads: 611,
        posts: 8_043,
      },
      {
        title: "Members' floor",
        blurb: "For the people who stayed.",
        threads: 903,
        posts: 12_660,
        private: true,
      },
    ],
    latest: { thread: "Answered: refunds after thirty days", when: "4 min ago" },
  },
  {
    id: "project",
    chip: "Open source",
    line: "Decisions argued in public, and still findable in five years.",
    body:
      "Support that does not need a GitHub account, proposals that outlive the thread they " +
      "started in, and an archive a search engine can actually reach.",
    board: { name: "libwarp", kind: "project board" },
    forums: [
      { title: "Announcements", blurb: "Releases, and what changed.", threads: 96, posts: 1_204 },
      {
        title: "Help & support",
        blurb: "Ask, answer, search first.",
        threads: 2_891,
        posts: 21_470,
      },
      {
        title: "RFCs & proposals",
        blurb: "Decisions, argued and then kept.",
        threads: 143,
        posts: 5_122,
      },
      {
        title: "Maintainers",
        blurb: "Security reports and triage.",
        threads: 210,
        posts: 1_988,
        private: true,
      },
    ],
    latest: { thread: "RFC 14: deprecating the v1 client", when: "31 min ago" },
  },
  {
    id: "guild",
    chip: "Gaming clan",
    line: "The roster, the rules, and who is actually turning up.",
    body:
      "Recruitment anyone can read before they apply, builds that do not vanish at the next " +
      "patch, and an officers' room for everything else.",
    board: { name: "Nightfall", kind: "clan board" },
    forums: [
      { title: "Raid nights", blurb: "Rosters, times, who's in.", threads: 1_877, posts: 24_310 },
      {
        title: "Builds & loadouts",
        blurb: "What works, and since when.",
        threads: 940,
        posts: 15_602,
      },
      {
        title: "Recruitment",
        blurb: "Applications, open to read.",
        threads: 388,
        posts: 2_914,
      },
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
  {
    id: "local",
    chip: "Residents' group",
    line: "A noticeboard the whole road can reach.",
    body:
      "No account with anybody required, nothing ranked by an algorithm, and the collection " +
      "notice reaching the neighbours who do not use apps.",
    board: { name: "Elmfield Residents", kind: "local board" },
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
      {
        title: "Buy, sell, give away",
        blurb: "Free to a good home.",
        threads: 655,
        posts: 3_104,
      },
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
]

export const picker = {
  prompt: "We are a…",
} as const

/*
 * ── The four losses ───────────────────────────────────────────────────────
 *
 * This band used to be four abstractions: "Own the place", "Your members are
 * nobody's product". Both true, neither one a sentence anybody has ever said.
 *
 * Same four ideas, put as the complaint first and the answer second, in the
 * words a person uses when they are annoyed. A visitor has to recognise
 * themselves before they will listen to a claim, and a quotation mark does
 * more of that work than a heading does.
 */
export interface Loss {
  readonly complaint: string
  readonly answer: string
}

export const losses: readonly Loss[] = [
  {
    complaint: "It just scrolls away.",
    answer:
      "In a chat, the answer you wrote on Tuesday is gone by Thursday. Here it is a thread. It " +
      "stays where it was put, it is still there in five years, and search reaches all the way " +
      "back — this season's question turns up last season's answer.",
  },
  {
    complaint: "Somebody else decides who sees it.",
    answer:
      "A feed ranks your fixture change below an ad. A notification setting nobody found buries " +
      "the AGM notice. On your own board a notice is a notice: everyone who is in can see it, in " +
      "the order it was written, and it can go out by email as well.",
  },
  {
    complaint: "Half of them aren't even on it.",
    answer:
      "Your treasurer is not on Discord. Plenty of your members will not open a Facebook " +
      "account, and should not have to. A board is a link — no app to install, no company to " +
      "join, and nobody shut out of their own club.",
  },
  {
    complaint: "And it isn't really ours.",
    answer:
      "Platforms change the rules, put a price on what was free, and close. Your board is your " +
      "domain, your database, your archive. Take it with you, or fork the software and carry it " +
      "on. Nobody can take it off you.",
  },
]

/*
 * ── Alongside, not instead ────────────────────────────────────────────────
 *
 * The strategically load-bearing section, and the one that removes the
 * objection every other section has to work around: nobody is abandoning their
 * group chat, and a page that implies they should is a page a committee votes
 * down. So the page says the opposite, first, in as many words.
 *
 * It also does the job the old copy never managed — saying what a board is
 * actually *for*. "Community software" describes a category; two lists of
 * things a reader recognises describe a job.
 */
export const alongside = {
  eyebrow: "Alongside what you already have",
  heading: "Chat is for now. This is for keeps.",
  lede:
    "You do not have to leave anywhere. Keep the group chat — it is good at what it is good " +
    "at. Put the things that need to still be true next month somewhere they will survive it.",
  columns: [
    {
      title: "Leave in the chat",
      items: [
        "who's about tonight",
        "today's lifts",
        "the banter",
        "“on my way”",
        "the photo from Saturday",
      ],
    },
    {
      title: "Put on the board",
      items: [
        "fixtures & results",
        "decisions and minutes",
        "how we do things",
        "registration & fees",
        "recruitment",
        "the archive",
        "what a new member needs in six months",
      ],
    },
  ],
} as const

export interface Capability {
  readonly title: string
  readonly body: string
  readonly doc: string
  readonly anchor: string | null
  readonly link: string
}

export const capabilities: readonly Capability[] = [
  {
    title: "A room for everyone, and one for the committee",
    body:
      "Open forums for the whole club, a members-only floor, a committee room nobody else " +
      "knows is there. Who can read, post, search or reply is decided per member, per forum — " +
      "and every way into the board, search and feeds included, obeys the same rules.",
    doc: "operating",
    anchor: "permissions",
    link: "How permissions work",
  },
  {
    title: "It looks like your community, not like software",
    body:
      "Your colours, your crest, light and dark — restyle the whole thing or install a " +
      "different theme entirely. A theme can only change how the board looks, never whether it " +
      "works, so a new coat of paint can never cost you the board.",
    doc: "theme-api",
    anchor: null,
    link: "How themes work",
  },
  {
    title: "Add what you are missing, without the fear",
    body:
      "Plugins add the things your community needs and stay in their lane. One that misbehaves " +
      "fails on its own: the page still renders, the thread still posts, the board carries on " +
      "as though it had never been installed.",
    doc: "plugin-api",
    anchor: null,
    link: "What plugins can do",
  },
  {
    title: "Years of answers, still findable",
    body:
      "Search that knows a thread about your question beats a passing mention of it, and stays " +
      "quick however deep the archive goes. The answer somebody wrote years ago keeps earning " +
      "its keep.",
    doc: "performance",
    anchor: null,
    link: "How search holds up",
  },
  {
    title: "Bots stay out, people get in",
    body:
      "A trap only bots fall into, questions you write about your own community, and a first " +
      "post held for somebody to glance at — which matters more in a juvenile section than it " +
      "does anywhere else. No puzzle grids, and no stranger deciding who is human enough to join.",
    doc: "operating",
    anchor: "spam",
    link: "How the spam controls work",
  },
  {
    title: "Whoever runs it is not chained to it",
    body:
      "Backups, migrations, member admin, scheduled jobs — everything nobody should have to " +
      "click through a browser for is one command or one API call, safe to script because it " +
      "obeys exactly the permissions a person would.",
    doc: "rest-api",
    anchor: null,
    link: "The API and the CLI",
  },
]

/*
 * ── Dues ──────────────────────────────────────────────────────────────────
 *
 * This ships in the repository and had never appeared on the page, which for
 * the club half of the audience meant the most persuasive thing here was
 * invisible. "Collect the subs, and the members' area opens by itself" is a
 * whole committee meeting's problem solved in one line.
 *
 * The claims are kept to what plugins/dues/README.md actually guarantees:
 * plans an administrator shapes in the panel, a grant that expires on its own,
 * and a board that stays correct if the plugin or Stripe goes away. It is a
 * plugin you register rather than something every board has switched on, and
 * the copy says so rather than implying a one-click install.
 */
export const dues = {
  eyebrow: "Membership, if you want it",
  heading: "Take the subs while you are at it.",
  lede:
    "Dues comes with the software: membership sold through Stripe, as a monthly or yearly " +
    "subscription, a pass from a day to two years, or a lifetime. You set the plans in the " +
    "panel — name, price, currency, length — and a member can buy one for themselves or gift " +
    "one to somebody by name.",
  points: [
    {
      title: "Paying opens the door by itself",
      body:
        "A paid membership puts that person in a group, and the group is what carries the " +
        "members-only forum, the badge, the name colour. Nobody chases a spreadsheet, and " +
        "nobody is added by hand.",
    },
    {
      title: "It expires without being watched",
      body:
        "Every membership runs out on its own. Remove the plugin, stop its tasks, or lose the " +
        "Stripe account entirely, and each one drains away at its own boundary — the board is " +
        "left correct rather than left open.",
    },
  ],
  emphasis:
    "And the money is between you and Stripe. There is no cut, no platform in the middle, and " +
    "no per-member fee at any point.",
  link: "How plugins work",
  readme: "Read what Dues does",
} as const

const HEADLINE_SCENARIO = "Thread, page 1"

export const performance = {
  eyebrow: "Still quick a decade in",
  heading: "Reading never drags.",
  lede:
    "Long threads, deep pages, a search across everything ever written — pages come back " +
    "before anyone wonders whether the board is busy, and they keep doing it as the archive " +
    "grows. Ten years of history is a feature of your community rather than a weight on it.",
  evidence(facts: Facts): string {
    const thread = facts.performance.scenarios.find(
      (scenario) => scenario.page === HEADLINE_SCENARIO,
    )

    if (!thread) {
      throw new Error(
        `docs/performance.md no longer measures “${HEADLINE_SCENARIO}”, which the landing page ` +
          "quotes. Name a scenario it does measure, here in src/content/site.ts.",
      )
    }

    return (
      `Measured, not asserted: against a board of ${compact(facts.performance.posts)} posts, ` +
      `a thread page renders in ${thread.p95Ms} ms at the 95th percentile — and a run over ` +
      `its ${thread.budgetMs} ms budget fails the build.`
    )
  },
  link: "Every measurement, and how it was taken",
} as const

/*
 * ── Where it runs ─────────────────────────────────────────────────────────
 *
 * This section used to open on four containers and a background tick, which
 * answers a question only one reader in five is asking and frightens the other
 * four. It is not a feature section. It is the objection section — "so who is
 * going to run the server?" is the last thing standing between a committee and
 * a decision — and it now opens by saying that out loud and answering it.
 *
 * The cost note exists because a treasurer's first question is what it costs
 * per year and the page never answered it. The figure is a floor rather than a
 * promise: a small board runs on a small VPS, a busy one needs more machine,
 * and the sentence says so. What does not move is the part worth the ink —
 * the bill follows the machine and never the membership.
 */
export const deployment = {
  eyebrow: "The bit people worry about",
  heading: "“But who's going to run it?”",
  lede:
    "Somebody in your community already does this for a living, or near enough — every club " +
    "has one and every project has three. This is a job for them, and it is smaller than they " +
    "will expect: about half an hour, once, and then it runs. What it needs is a server, a " +
    "domain, and nobody's permission.",
  cost: {
    title: "What it costs",
    body:
      "A small board is happy on a VPS of about €15 a month, and a busy one wants a bigger " +
      "machine — that part scales with your board the way anything does.",
    emphasis:
      "What never changes is what the bill follows. It follows the machine, never the " +
      "membership: two hundred members cost exactly what twenty do, and there is no tier that " +
      "unlocks the private forum.",
  },
  options: [
    {
      title: "Guided, with Coolify",
      body:
        "A panel installed on the same server — still your machine, not a service you sign up " +
        "to. Point it at the repository and it generates the secrets and the database password, " +
        "issues the certificate, tells the board its own address, and redeploys on push.",
      note: "Nothing is typed in. About twenty minutes.",
      action: { label: "The quickstart", doc: "quickstart" },
    },
    {
      title: "Or by hand, if they would rather",
      body:
        "The same four containers without the panel — Postgres, a one-shot migration the others " +
        "wait on, the web server, and the worker that runs the background tick. A clone, an " +
        ".env with three generated secrets, one command, and a reverse proxy they already run.",
      note: "Postgres and nothing else — no Redis, no broker, no search cluster.",
      action: { label: "Deploying by hand", doc: "self-hosting" },
    },
  ],
  link: "The operator handbook",
} as const

/*
 * Two short bands where there used to be two long ones. Both are proof rather
 * than pitch — the reader who wants them will read a paragraph, and the reader
 * who does not was never going to read a section.
 */
export const migration = {
  eyebrow: "Coming from somewhere else",
  heading: "Bring the archive if you have one.",
  body:
    "A MyBB board imports whole, and the importer is resumable, so a decade of history moves " +
    "across several sittings rather than one long night. Old links keep working, so every URL " +
    "anybody ever posted still lands.",
  emphasis:
    "Coming from a chat platform is different, and it is worth being straight about it: there " +
    "is usually no clean way to get your history out of one. That is their decision rather " +
    "than ours. Most communities start the board fresh and carry across the handful of threads " +
    "that were always worth keeping.",
  link: "The parity decisions",
} as const

export const licensing = {
  eyebrow: "The licence",
  heading: "Yours to keep.",
  body:
    "Meith is free software under the GNU Lesser General Public License v3. Run a board on it " +
    "for anything at all, commercially included, without publishing a line of your " +
    "configuration or a word your members wrote. Nobody can put a price on it later, and " +
    "nobody can switch it off.",
  points: [
    {
      title: "Themes and plugins are yours",
      body:
        "Both fill an interface this software provides, which is the case the Lesser GPL exists " +
        "to allow. License yours however you like — it is not obliged to be LGPL because the " +
        "board it runs in is.",
    },
    {
      title: "Changes to Meith come back",
      body:
        "Modify the board itself and those changes carry the same licence to whoever you hand " +
        "the modified version to. That is the copyleft, and it is the whole of what is asked.",
    },
  ],
  emphasis:
    "Which is the point of choosing it: the version you are running stays free software " +
    "whatever anybody decides later, and anybody can carry it on.",
  link: "Read the licence",
  note:
    "LGPLv3 is additional permissions on top of the GNU GPL, which it incorporates. Both texts " +
    "are in the repository, and both travel with any copy you pass on.",
} as const

export const documentation = {
  eyebrow: "Documentation",
  heading: "Organised by what you are trying to do.",
  lede:
    "Four of the references are generated from the code they describe, and one that " +
    "disagrees with your board fails the build rather than misleading you. Every page is " +
    "rendered from the Markdown in the repository — there is no second copy to fall behind.",
} as const

export const closing = {
  heading: "Give your community somewhere to keep things.",
  body:
    "A place of your own, on a machine of your own, in about half an hour. Have a look at a " +
    "real one first, and read the source before you run it — all of it is there.",
  action: "Set one up",
  requirements: [
    { label: "A machine", value: "Your own, with Docker" },
    { label: "A domain", value: "Pointed at it" },
    { label: "Everything else", value: "Comes up beside it" },
  ],
} as const

export const footer = {
  colophon:
    "Rendered from the Markdown in the repository. No analytics and no third-party scripts — " +
    "the only thing this site stores is the colour scheme you pick, in your own browser.",
} as const
