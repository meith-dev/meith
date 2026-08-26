import { licenceHref } from './site'

export interface Loss {
  readonly complaint: string
  readonly answer: string
}

export type SegmentLink =
  | { readonly label: string; readonly doc: string }
  | { readonly label: string; readonly href: string }

export interface Segment {
  readonly slug: string
  readonly name: string
  readonly lowerName: string
  readonly chooserLine: string
  readonly theme: string
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
    lowerName: 'open-source projects',
    chooserLine:
      'A support forum your project owns: answers with URLs worth pinning, pages that render ' +
      'without JavaScript, and an archive no platform can sunset.',
    meta: {
      title: 'Meith for open-source projects — a discussions forum you own',
      description:
        'Give your project a support forum on its own domain: server-rendered threads any ' +
        'search engine can index, answers people can link for years, an MIT engine you can ' +
        'read, and a REST API for the bots you already run.',
    },
    hero: {
      badge: 'For maintainers, and the communities around their code',
      headline: {
        before: 'Your best answers deserve',
        emphasis: 'better than a chat scrollback.',
      },
      lede:
        'A question answered in chat is answered again next week. Meith gives a project a ' +
        'real forum: threads with URLs worth pinning in an issue, search that reaches back ' +
        'years, pages that render as plain HTML so everything is fast and indexable — on ' +
        'your own domain, under the MIT licence, run by you.',
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
          'apart with the operator CLI whenever you like. Nothing lives anywhere else.',
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
          'upgrades with the procedure written down. An evening a month, not a pager.',
      },
    ],
    feature: {
      eyebrow: 'Server-first',
      heading: 'Readable by everyone, indexable by everything.',
      lede:
        'Every thread is server-rendered HTML: quick on a bad connection, legible to ' +
        'crawlers, working with JavaScript switched off. The performance budgets are ' +
        'measured against a board with years of history, and a release that breaks one is ' +
        'never published. For the bots and dashboards a project inevitably grows, the REST ' +
        'API covers anything an administrator can do by hand.',
      links: [
        { label: 'The measured budgets', doc: 'performance' },
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
    slug: 'legacy-forums',
    theme: 'default',
    boardCaption: 'A freshly imported board, in the default theme.',
    name: 'MyBB & phpBB boards',
    lowerName: 'MyBB and phpBB boards',
    chooserLine:
      'The way out of a PHP forum nobody wants to maintain: members, posts and working ' +
      'passwords, imported whole.',
    meta: {
      title: 'Meith for MyBB and phpBB boards — import the whole board, passwords included',
      description:
        'Move a MyBB or phpBB board to a modern TypeScript engine: the importer carries ' +
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

  {
    slug: 'product-communities',
    theme: 'phasebook',
    boardCaption: 'A customer community in Phasebook — the social shape everybody already knows.',
    name: 'Product & SaaS communities',
    lowerName: 'product and SaaS communities',
    chooserLine:
      'A support community on your domain, behind your identity provider, wearing your ' +
      'brand — with no per-member pricing.',
    meta: {
      title: 'Meith for product communities — a support forum without per-member pricing',
      description:
        'Run your customer community on infrastructure you already operate: federated ' +
        'sign-in against your identity provider, themes that carry your brand, typed ' +
        'plugins for your integrations, and a bill that never scales with sign-ups.',
    },
    hero: {
      badge: 'For the team that owns the community roadmap',
      headline: {
        before: 'Community platforms charge per member.',
        emphasis: 'Your server does not.',
      },
      lede:
        'Hosted community platforms price the thing you are trying to grow. Meith runs on ' +
        'infrastructure your team already knows: sign-in federates against GitHub, Google ' +
        'or your own identity server, the theme carries your brand, and the bill follows ' +
        'the machine rather than the member count.',
    },
    losses: [
      {
        complaint: 'The platform bill scales with sign-ups.',
        answer:
          'The bill here follows the server. Two hundred thousand members cost what two ' +
          'hundred do, and growth stops being a pricing event.',
      },
      {
        complaint: 'Customers need yet another password.',
        answer:
          'Federated sign-in meets them where they already are — GitHub, Google, or your ' +
          'own identity server — with passkeys and two-factor for the accounts that want ' +
          'them.',
      },
      {
        complaint: 'The community looks like the platform, not like us.',
        answer:
          'A theme fills documented slots with your brand, and changes how the board looks ' +
          'and nothing else — so a redesign can never cost you the board.',
      },
      {
        complaint: 'Custom integrations mean a professional-services quote.',
        answer:
          'A plugin is a typed TypeScript package your own team writes against documented ' +
          'hooks. One that misbehaves fails alone, and the board carries on without it.',
      },
    ],
    feature: {
      eyebrow: 'Sign-in',
      heading: 'Your customers, your identity provider, your data.',
      lede:
        'Members sign in the way the rest of your product signs in: passwords with ' +
        'two-factor, passkeys, or federated against the provider you already run. Every ' +
        'thread, member and message sits in your PostgreSQL — searchable through the API, ' +
        'answerable to your retention policy, and never a data-processing addendum away.',
      links: [
        { label: 'How sign-in works', doc: 'single-sign-on' },
        { label: 'How themes work', doc: 'themes' },
      ],
    },
    closing: {
      heading: 'Own the community you are building.',
      body:
        'Scaffold a board, put your theme on it, and point staging at your identity ' +
        'provider — the whole evaluation runs on one machine.',
    },
  },

  {
    slug: 'agencies',
    theme: 'raidframe',
    boardCaption: "A client's clan board in Raidframe — one engine, very different boards.",
    name: 'Agencies & dev shops',
    lowerName: 'agencies and dev shops',
    chooserLine:
      'One engine, a board per client: each a small config repo you can theme, deploy, ' +
      'upgrade — and hand over whole.',
    meta: {
      title: 'Meith for agencies — a forum engine you can hand to clients',
      description:
        'Build community sites for clients on one engine: every board a small repository ' +
        'with a deploy kit, themes per brand, versioned upgrades — and a handover that is a ' +
        'repository transfer, not a hostage negotiation.',
    },
    hero: {
      badge: 'For the shop that builds it, ships it, and hands it over',
      headline: {
        before: 'Every client board,',
        emphasis: 'a repository you can hand over.',
      },
      lede:
        'A Meith board is a config repo pinning one exact engine version, with a Dockerfile, ' +
        'a compose file and a CI workflow already in it. Scaffold, theme to the brand, ' +
        'deploy — and when the engagement ends, the client keeps a repository and a ' +
        'database. The board was always theirs.',
    },
    losses: [
      {
        complaint: 'Every community build starts from zero.',
        answer:
          'npx create-meith writes the workspace, the deploy kit and the CI workflow. The ' +
          'first day of a new board is theming, not plumbing.',
      },
      {
        complaint: 'Handover is where projects go to die.',
        answer:
          'The deliverable is a repository and a database, and the day-to-day runs from the ' +
          'browser — organisers manage forums, members and settings without you on retainer.',
      },
      {
        complaint: 'Each client wants a different look.',
        answer:
          'Five shipped themes set the range — a clubhouse, a terminal, a game HUD — and ' +
          'the slot contract is documented and versioned for the ones you build yourself.',
      },
      {
        complaint: 'Maintaining five boards means five snowflakes.',
        answer:
          'Each board pins its exact version, so an upgrade is a reviewable version-bump ' +
          'diff, board by board, on your schedule. Nothing updates underneath a client.',
      },
    ],
    feature: {
      eyebrow: 'The board repository',
      heading: 'Configuration is code, so boards fit your workflow.',
      lede:
        'What a board is made of — engine version, themes, plugins — is pinned in typed ' +
        'config the compiler checks, so it reviews, diffs and reverts like everything else ' +
        'you ship. What the community does lives in its database and its admin panel, so a ' +
        'deploy can never delete a forum and a client can never break the build.',
      links: [
        { label: 'Configuration in code', doc: 'configuration' },
        { label: 'The marketplace', doc: 'marketplace' },
      ],
    },
    closing: {
      heading: 'Add forums to what you can ship.',
      body:
        'Scaffold one this afternoon and walk the whole route — theme, deploy, handover — ' +
        'before any client is watching.',
    },
  },

  {
    slug: 'communities',
    theme: 'clubhouse',
    boardCaption: "A club's board, in the Clubhouse theme.",
    name: 'Clubs & communities',
    lowerName: 'clubs and communities',
    chooserLine:
      'The volunteer-run version: clubs, associations, clans and groups that need one place ' +
      'everybody can reach.',
    meta: {
      title: 'Meith for clubs and communities — one place everybody can reach',
      description:
        'A board for the community you already have: announcements that stay put, private ' +
        'rooms for the committee, memberships taken through Stripe, and a handover that ' +
        'survives the volunteers changing.',
    },
    hero: {
      badge: 'For clubs, associations, clans, and every group run by volunteers',
      headline: {
        before: 'The group chat forgets.',
        emphasis: 'Your board will not.',
      },
      lede:
        'One technical member sets it up in an evening; everybody else just gets a link. ' +
        'Announcements stay where they are put, decisions are findable years later, the ' +
        "committee's room is private, and the subs are taken online. When the person who " +
        'set it up moves on, the board is handed over whole.',
    },
    losses: [
      {
        complaint: 'I sent it three times and half of them still missed it.',
        answer:
          'A notice stays in the forum you put it in, is still there on Saturday morning, ' +
          'and can go out by email to the whole community at once.',
      },
      {
        complaint: 'Half our members are not on Facebook, and never will be.',
        answer:
          'Your board is a link — no account with any company, no app to install, and ' +
          'nobody shut out for refusing a platform.',
      },
      {
        complaint: 'The subs are a spreadsheet and a shoebox.',
        answer:
          "A member pays through Stripe, the members' area opens for them, and the whole " +
          'thing lapses on its own when the year is up.',
      },
      {
        complaint: 'Nobody can find the minutes from March.',
        answer:
          'Every decision is a thread in a forum only the committee can see, and search ' +
          'goes back through all of it.',
      },
    ],
    feature: {
      eyebrow: 'Membership',
      heading: 'Take the subs online, and stop chasing them.',
      lede:
        'Dues comes with the software: membership sold through Stripe as a subscription, a ' +
        'pass or a lifetime, with the plans set in your own panel. Paying opens the ' +
        'members-only forum by itself, and the money is between your community and Stripe — ' +
        'no cut, and no per-member fee at any point.',
      links: [
        { label: 'The memberships guide', doc: 'membership-guide' },
        { label: "The organiser's guide", doc: 'organiser-guide' },
      ],
    },
    closing: {
      heading: 'Give your community somewhere to keep things.',
      body:
        'Set up by one person in an evening, run from a browser by the people who run ' +
        'everything else. Have a look at a real board first.',
    },
  },
]

export function findSegment(slug: string): Segment | undefined {
  return segments.find((segment) => segment.slug === slug)
}

export function segmentHref(slug: string): string {
  return `/for/${slug}`
}
