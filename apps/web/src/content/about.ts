export const about = {
  href: '/about',
  meta: {
    title: 'About Meith — Why we’re building open-source community software',
    description:
      'Learn why Meith exists, the principles behind its open-source and self-hosted approach, ' +
      'and how the name was inspired by the Irish tradition of meitheal.',
  },
  hero: {
    heading: 'About Meith',
    lead: 'Software for communities that want a place of their own.',
    paragraphs: [
      'Meith started from a simple frustration: more and more communities live inside ' +
        'platforms they do not control. The conversations may belong to the community, but ' +
        'the domain, the infrastructure, the archive, the rules, the pricing and the future ' +
        'of the platform do not.',
      'Meith exists to offer another option.',
    ],
    belief: 'Communities should own the places where their conversations live.',
  },
  sections: {
    why: {
      heading: 'Communities deserve a home they can own.',
      paragraphs: [
        'For a long stretch of the web, a community had a website. It had a domain, a forum ' +
          'or a mailing list, an archive that search engines could read, and somebody who ' +
          'looked after the server. Much of that has moved into centralised platforms, and ' +
          'for understandable reasons: they are free to start, they are where people already ' +
          'are, and many of them are excellent at what they do.',
        'Discord, Slack, Reddit, GitHub Discussions and the social platforms are not the ' +
          'problem. Dependency is. A community can spend years building discussions, answers, ' +
          'guides, decisions and shared knowledge inside a product whose priorities are set ' +
          'somewhere else, and whose priorities may eventually change.',
      ],
      consequences: [
        'Pricing changes, and the community is now a cost line',
        'The product changes direction, and the features the community relied on go with it',
        'Moderation policy changes, and the community did not get a vote',
        'Exports are partial, awkward, or absent',
        'Search gets worse, and years of answers become harder to reach',
        'The platform shuts down, or the community’s space is closed',
        'The community turns out to depend on one person’s account rather than owning a place',
      ],
      close:
        'None of that requires bad intent. It is what happens when the place a community ' +
        'lives belongs to somebody else. A community should be able to change maintainers, ' +
        'servers, hosts or infrastructure without losing its identity or its history.',
    },
    keeps: {
      heading: 'Chat is for now. Meith is for keeps.',
      paragraphs: [
        'Meith is not trying to replace every kind of community communication. Real-time ' +
          'chat is good at casual conversation, quick questions, coordination, social ' +
          'interaction and whatever is happening right now. It should stay good at those ' +
          'things.',
        'Meith is for what a community may still care about months or years later: the ' +
          'answers, the decisions, the guides, the announcements, the discussions worth ' +
          'returning to, the events, the technical knowledge and the institutional memory. ' +
          'Those things want a URL that lasts, a page a search engine can read, and a place ' +
          'that does not scroll away.',
        'Nothing has to move. Meith is meant to sit alongside a chat, not in place of it. One ' +
          'is for talking; the other is for keeping.',
      ],
      pull: 'Chat is a conversation. Meith is a record.',
    },
    ownership: {
      heading: 'Ownership is not an enterprise feature.',
      paragraphs: [
        'Self-hosting, open source, data ownership and control over infrastructure are not ' +
          'secondary technical features of Meith, listed on a pricing page for the largest ' +
          'tier. They are the reason the project exists.',
        'There is no Meith company account sitting between a community and its members. The ' +
          'board runs on a server the community rents, at a domain it owns, from a database ' +
          'it can back up and take with it.',
      ],
      owned: [
        'the domain',
        'the server',
        'the database',
        'the configuration',
        'the theme',
        'the extensions',
        'the archive',
        'the community’s identity',
      ],
      cost: {
        heading: 'Pay for infrastructure, not popularity.',
        body:
          'Hosting costs money, and Meith does not pretend otherwise: somebody rents a machine ' +
          'and looks after it. But growing the community should not create a software licence ' +
          'bill simply because more people joined. Meith itself does not charge per member, ' +
          'per seat or per post, and never taxes a community for succeeding.',
      },
    },
    openSource: {
      heading: 'Open source by design.',
      paragraphs: [
        'Meith is released under the MIT licence, and there is no hosted edition holding ' +
          'features back. That is not only so you can read the code, though you can. It is ' +
          'because of what the software holds.',
        'A forum stores a community’s memory, sometimes decades of it. Software with that ' +
          'job should not require blind trust in whoever made it. The community running Meith ' +
          'can inspect it, modify it, extend it, migrate away from it, contribute to it, and ' +
          'fork it if the project ever moves in a direction they disagree with. If the ' +
          'original maintainers disappear, the community keeps running.',
      ],
      pull: 'Software that stores a community’s memory should not require blind trust in the company that made it.',
    },
    handover: {
      heading: 'Handed over, not started over.',
      paragraphs: [
        'Communities often outlive the people currently maintaining them. Open-source ' +
          'projects change maintainers. Clubs elect new committees. Meetup organisers move ' +
          'on. Developer advocates change roles. Volunteer communities evolve. The ' +
          'infrastructure should survive those changes.',
        'Meith is designed to be transferable rather than tied to one person’s account. A ' +
          'board is a repository and a database. Configuration is code that can be read. Roles ' +
          'are handed over in the admin panel, and the operations guides assume the person ' +
          'inheriting the board did not build it.',
      ],
      outcome:
        'A new maintainer should be able to inherit the repository, the infrastructure, the ' +
        'documentation and the data, and continue operating the same community.',
    },
    software: {
      heading: 'Built like software, because it is software.',
      paragraphs: [
        'Many community platforms are configured almost entirely through dashboards. Meith ' +
          'deliberately takes a different approach. A board lives in a repository. ' +
          'Configuration can be reviewed. Themes and plugins are version controlled. Changes ' +
          'move through normal development workflows, deployments are repeatable, and ' +
          'upgrades are deliberate version bumps rather than something that happens to you.',
        'That is not the right approach for every community, and the day-to-day running of ' +
          'a board — forums, members, announcements, permissions — stays in the browser. The ' +
          'philosophy is narrower: communities with technical operators should be able to ' +
          'manage their community infrastructure with the same tools and practices they use ' +
          'for the rest of their software.',
      ],
      link: 'Meith for Developers',
    },
    name: {
      heading: 'Why “Meith”?',
      paragraphs: [
        'Meith takes its name from meitheal, an Irish tradition of people coming together to ' +
          'help one another with shared work — neighbours contributing time and effort ' +
          'because the work benefits the group.',
        'No single person owns the effort. Everyone contributes something, and the result ' +
          'belongs to the community. That felt like the right idea for software built around ' +
          'shared discussion, shared knowledge and community ownership.',
        '“Meith” is a shortened project name inspired by that idea, not an attempt to make ' +
          'the software culturally specific. It is meant to work as a name anywhere, with a ' +
          'meaning behind it for anyone who asks.',
      ],
    },
    future: {
      heading: 'What Meith wants to become.',
      lede:
        'This is an ethos rather than a roadmap. Meith should become infrastructure ' +
        'communities can rely on, not a platform they become trapped inside.',
      aims: [
        'A dependable foundation for independent online communities',
        'Easy enough to start without weeks of infrastructure work',
        'Extensible enough that communities can make it their own',
        'Stable enough to hold years of community history',
        'Boring, in the good infrastructure sense',
        'Transparent about how it works',
        'Welcoming to contributors',
        'Respectful of operators’ control over their own infrastructure',
      ],
    },
    principles: {
      heading: 'The principles behind Meith.',
      list: [
        {
          title: 'Own your community.',
          body: 'The people running the community should control its infrastructure and data.',
        },
        {
          title: 'Keep what matters.',
          body: 'Community knowledge should remain useful long after the original conversation.',
        },
        {
          title: 'Open beats locked in.',
          body: 'Operators should always have a way out.',
        },
        {
          title: 'Pay for infrastructure, not members.',
          body: 'Success should not create a per-seat tax.',
        },
        {
          title: 'Configuration should be understandable.',
          body: 'Important behaviour should be inspectable, reviewable and reproducible.',
        },
        {
          title: 'Communities outlive maintainers.',
          body: 'Handover should be a normal part of the design.',
        },
        {
          title: 'Extensibility over assumptions.',
          body:
            'Meith should provide a foundation communities can adapt rather than forcing every ' +
            'community into the same shape.',
        },
      ],
    },
  },
  closing: {
    heading: 'Build somewhere worth keeping.',
    body:
      'If your community deserves more than another account on someone else’s platform, ' +
      'Meith is built to give it a place of its own.',
  },
} as const
