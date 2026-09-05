import { type Audience, developers } from './developers'
import { licenceHref } from './site'

export interface Loss {
  readonly complaint: string
  readonly answer: string
}

export type SegmentLink =
  | { readonly label: string; readonly doc: string }
  | { readonly label: string; readonly href: string }

export interface Segment extends Audience {
  readonly theme: string
  readonly boardCaption: string
  readonly losses: readonly Loss[]
  readonly belongs?: {
    readonly heading: string
    readonly lede: string
    readonly columns: readonly { readonly title: string; readonly items: readonly string[] }[]
  }
  readonly feature: {
    readonly eyebrow: string
    readonly heading: string
    readonly lede: string
    readonly links: readonly SegmentLink[]
  }
  readonly closing: { readonly heading: string; readonly body: string }
}

export const origin = {
  heading: 'Coming from somewhere else?',
  body:
    'There is no clean way out of a Facebook group, a Discord server or a Slack. Most ' +
    'communities start fresh, run both for a season, and move what was worth keeping. A MyBB ' +
    'or phpBB board imports whole — working passwords included.',
  link: 'How the move works',
} as const

export const segments: readonly [Segment, ...Segment[]] = [
  {
    slug: 'open-source',
    theme: 'midnight',
    boardCaption: "A project's board in Midnight — a terminal, for a community that lives in one.",
    name: 'Open-source projects',
    lowerName: 'open source',
    card: {
      heading: 'Give your project a community home outside the issue tracker.',
      line:
        'Keep support answers, proposals, announcements, discussions, guides and project ' +
        'knowledge searchable and independent.',
      cta: 'Meith for Open Source',
    },
    meta: {
      title: 'Meith for Open Source Projects',
      description:
        'Give your open-source project an independent home for support, discussions, ' +
        'announcements and community knowledge.',
    },
    hero: {
      badge: 'For maintainers, and the communities around their code',
      headline: {
        before: 'Give your project a home',
        emphasis: 'beyond the issue tracker.',
      },
      lede:
        'GitHub Issues should not have to be your support forum, roadmap discussion, Q&A, ' +
        'announcements board and community archive at the same time. Meith gives a project an ' +
        'independent place for support questions, proposals, guides, announcements, events ' +
        'and the long-running technical knowledge around it — on its own domain, run by the ' +
        'project.',
    },
    losses: [
      {
        complaint: 'We answer the same question every release.',
        answer:
          'A thread has a URL. Answer once, link it from the release notes, and search puts ' +
          'the thread that settles it ahead of a passing mention of it.',
      },
      {
        complaint: 'Our community lives on a platform we cannot export.',
        answer:
          'The board is PostgreSQL on a server you rent: back it up, move it, or take it ' +
          'apart with the operator CLI whenever you like. It is independent of any one ' +
          'development platform.',
      },
      {
        complaint: "Contributors will not make an account on somebody else's service.",
        answer:
          "Reading needs no account at all, and sign-in is your board's own — passwords, " +
          'passkeys, or GitHub as a federated provider.',
      },
      {
        complaint: 'A forum is one more service to babysit.',
        answer:
          'Four containers with health checks, backups as CLI commands, and versioned ' +
          'upgrades with the procedure written down. An evening a month, not a pager. When ' +
          'maintainers change, the board is handed over with the repository.',
      },
    ],
    feature: {
      eyebrow: 'Server-first',
      heading: 'Readable by everyone, indexable by everything.',
      lede:
        'Every thread is server-rendered HTML: quick on a bad connection, legible to ' +
        'crawlers, working with JavaScript switched off. The performance budgets are ' +
        'measured against a board with years of history, and a release that breaks one is ' +
        'never published. Theme it to match the project, and for the bots and dashboards a ' +
        'project inevitably grows, the REST API covers anything an administrator can do by ' +
        'hand. There is no per-member pricing, and the engine is MIT — like yours.',
      links: [
        { label: 'The measured budgets', doc: 'performance' },
        { label: 'How themes work', doc: 'themes' },
        { label: 'Read the licence', href: licenceHref },
      ],
    },
    closing: {
      heading: 'Give the project a place answers accumulate.',
      body:
        "Scaffold it, run it in fixture mode over a coffee, and put it on the project's own " +
        'domain. Read the source first — it is MIT, like yours.',
    },
  },

  {
    slug: 'communities',
    theme: 'phasebook',
    boardCaption: 'A community board in Phasebook — the social shape everybody already knows.',
    name: 'Community organisers',
    lowerName: 'communities',
    card: {
      heading: 'Build a place your community can actually own.',
      line:
        'Run discussions, announcements, events, knowledge and memberships without putting ' +
        'the community entirely inside someone else’s platform.',
      cta: 'Meith for Communities',
    },
    meta: {
      title: 'Meith for Online Communities',
      description:
        'A self-hosted home for community discussions, announcements, events and knowledge ' +
        'that your community owns.',
    },
    hero: {
      badge: 'For organisers, meetups, interest groups and online communities',
      headline: {
        before: 'Give your community',
        emphasis: 'a place of its own.',
      },
      lede:
        'Keep the chat for what is happening now. Meith becomes the permanent community ' +
        'record: discussions people can find again, announcements that stay put, event ' +
        'information, the guides newcomers need, and memberships — under your own name, on ' +
        'your own domain, owned by the community rather than a platform.',
    },
    belongs: {
      heading: 'Chat is for now. Meith is for keeps.',
      lede:
        'Discord, Slack, WhatsApp and Telegram stay useful for live interaction. Meith is the ' +
        'durable layer beside them, for the things worth keeping.',
      columns: [
        {
          title: 'Keep in chat',
          items: ['The banter', 'Tonight’s plans', 'Quick questions', '“Anyone around?”'],
        },
        {
          title: 'Keep in Meith',
          items: [
            'Answers',
            'Announcements',
            'Decisions',
            'Guides',
            'Events',
            'Community knowledge',
          ],
        },
      ],
    },
    losses: [
      {
        complaint: 'The answer is in the chat somewhere. Nobody can find it.',
        answer:
          'A thread keeps its URL and search covers the whole archive, so the good answer ' +
          'from two years ago is still the good answer.',
      },
      {
        complaint: 'Half our members are not on that platform, and never will be.',
        answer:
          'Your board is a link — no account with any company, no app to install, and ' +
          'nobody shut out for refusing a platform.',
      },
      {
        complaint: 'The community looks like the platform, not like us.',
        answer:
          'The name, the colours and the theme are yours. Five themes ship with the board, ' +
          'and a look of your own never risks a working board.',
      },
      {
        complaint: 'We are one policy change away from losing everything.',
        answer:
          'The board is a database on a server you rent, at a domain you own. Nobody outside ' +
          'the community can price it later, change its rules or switch it off.',
      },
    ],
    feature: {
      eyebrow: 'Run from a browser',
      heading: 'Set up by one person. Run by the people who run everything else.',
      lede:
        'One technical member sets the board up in an evening; everybody else gets a link. ' +
        'Forums, announcements, members, permissions and the community’s look are all run ' +
        'from the admin panel. Members sign in with a password, a passkey, or an account they ' +
        'already have. Memberships, if you want them, are sold through your own Stripe ' +
        'account with no cut and no per-member fee.',
      links: [
        { label: "The organiser's guide", doc: 'organiser-guide' },
        { label: 'How sign-in works', doc: 'single-sign-on' },
        { label: 'The memberships guide', doc: 'membership-guide' },
      ],
    },
    closing: {
      heading: 'Give your community somewhere to keep things.',
      body:
        'Set up by one person in an evening, run from a browser by the people who run ' +
        'everything else. Have a look at a real board first.',
    },
  },

  {
    slug: 'clubs-and-associations',
    theme: 'clubhouse',
    boardCaption: "A club's board, in the Clubhouse theme.",
    name: 'Clubs & associations',
    lowerName: 'clubs & associations',
    card: {
      heading: 'A community platform that survives the committee.',
      line:
        'Keep discussions, announcements, records and institutional knowledge in a system ' +
        'that can be handed from one group of organisers to the next.',
      cta: 'Meith for Clubs & Associations',
    },
    meta: {
      title: 'Meith for Clubs & Associations',
      description:
        'Self-hosted community software for clubs, associations and member-led organisations ' +
        'that need continuity, ownership and searchable history.',
    },
    hero: {
      badge: 'For clubs, societies, associations and volunteer-run organisations',
      headline: {
        before: 'A community platform',
        emphasis: 'that survives the committee.',
      },
      lede:
        'Committees change. The club carries on. Meith keeps announcements, decisions, ' +
        'member discussions, events and the institutional memory in one place that is handed ' +
        'from one group of organisers to the next — not started over each time.',
    },
    losses: [
      {
        complaint: 'I sent it three times and half of them still missed it.',
        answer:
          'A notice stays in the forum you put it in, is still there on Saturday morning, ' +
          'and can go out by email to the whole community at once.',
      },
      {
        complaint: 'Nobody can find the minutes from March.',
        answer:
          'Every decision is a thread in a forum only the committee can see, and search ' +
          'goes back through all of it.',
      },
      {
        complaint: 'The subs are a spreadsheet and a shoebox.',
        answer:
          "A member pays through Stripe, the members' area opens for them, and the whole " +
          'thing lapses on its own when the year is up.',
      },
      {
        complaint: 'The person who set it up has left, and the login went with them.',
        answer:
          'Nothing lives in anybody’s personal account. Roles are handed over in the admin ' +
          'panel, the board stays the club’s, and the next committee inherits the archive.',
      },
    ],
    feature: {
      eyebrow: 'Handed over, not started over',
      heading: 'Infrastructure the next committee can inherit.',
      lede:
        'The board runs on a server rented in the club’s name, at the club’s own domain, ' +
        'with the club’s records in its own database. The cost is the machine, not the ' +
        'membership: fifty members or five hundred, the bill is the same. Setting it up needs ' +
        'one person with an evening and a guide; running it needs a browser.',
      links: [
        { label: "The organiser's guide", doc: 'organiser-guide' },
        { label: 'The memberships guide', doc: 'membership-guide' },
        { label: 'Setting up a server', doc: 'coolify' },
      ],
    },
    closing: {
      heading: 'Give the club a home it can hand on.',
      body:
        'One person sets it up in an evening. Everyone else gets a link. When the committee ' +
        'changes, the board does not.',
    },
  },

  {
    slug: 'legacy-forums',
    theme: 'default',
    boardCaption: 'A freshly imported board, in the default theme.',
    name: 'MyBB & phpBB boards',
    lowerName: 'MyBB and phpBB boards',
    secondary: true,
    card: {
      heading: 'Bring twenty years of threads across whole.',
      line:
        'The way out of a PHP forum nobody wants to maintain: members, posts and working ' +
        'passwords, imported in one go.',
      cta: 'Moving from MyBB or phpBB',
    },
    meta: {
      title: 'Meith for MyBB and phpBB boards — import the whole board, passwords included',
      description:
        'Move a MyBB or phpBB board to a modern, open-source engine: the importer carries ' +
        'members, content, private messages, attachments, polls, warnings and bans, keeps ' +
        'passwords working, and redirects the old URLs.',
    },
    hero: {
      badge: 'For the operator of a board that outlived its software',
      headline: {
        before: 'Twenty years of threads.',
        emphasis: 'One import.',
      },
      lede:
        'The community is fine; the PHP underneath it is the problem. The importer moves ' +
        'members, content, private messages, attachments, avatars, subscriptions, polls, ' +
        'reputation, warnings and bans — with working passwords, and redirects from the old ' +
        'URLs so years of inbound links keep landing.',
    },
    losses: [
      {
        complaint: 'Nobody dares touch the server, so nothing gets upgraded.',
        answer:
          'A Meith board is a small repository pinning one exact engine version. An upgrade ' +
          'is a version bump with the procedure written down, and nothing moves underneath ' +
          'you between them.',
      },
      {
        complaint: 'A migration means every member resets their password.',
        answer:
          'Not this one: imported members sign in with the password they already had. The ' +
          'move is invisible on the login page.',
      },
      {
        complaint: 'Our search results all point at the old URLs.',
        answer:
          'The importer sets up redirects from the old paths, so the link somebody posted in ' +
          '2009 still lands on the same thread.',
      },
      {
        complaint: 'The old board does things the new one will not.',
        answer:
          'Where behaviour deliberately differs, it is written down — a parity page per ' +
          'source lists every decision, so you can read the trade before making it.',
      },
    ],
    feature: {
      eyebrow: 'The importer',
      heading: 'Bring it across whole, then retire the ladder.',
      lede:
        'Point the importer at a MyBB or phpBB database and it carries the lot: the ' +
        'coverage table in the migration guide lists exactly what moves from each source, ' +
        'and what to do after it finishes. Run it against a copy first and browse the ' +
        'result — the old board keeps running until you point the domain.',
      links: [
        { label: 'The migration procedure', doc: 'migrating' },
        { label: 'The parity decisions', doc: 'mybb-parity' },
      ],
    },
    closing: {
      heading: 'Retire the PHP. Keep the community.',
      body:
        'Import a copy of the database this weekend and click around the result. Nothing ' +
        'about the old board changes until you decide it does.',
    },
  },
]

export const audiences: readonly Audience[] = [developers, ...segments]

export const primaryAudiences: readonly Audience[] = audiences.filter(
  (audience) => audience.secondary !== true,
)

export function findSegment(slug: string): Segment | undefined {
  return segments.find((segment) => segment.slug === slug)
}

export function findAudience(slug: string): Audience | undefined {
  return audiences.find((audience) => audience.slug === slug)
}

export const audienceIndexHref = '/who-its-for'

export function audienceHref(slug: string): string {
  return `${audienceIndexHref}/${slug}`
}
