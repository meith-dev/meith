import Link from 'next/link'

import { CommandLine } from '../src/components/command-line'
import { ForumLink } from '../src/components/forum-link'
import { ThemeShowcase } from '../src/components/theme-showcase'
import { licenceHref, scaffoldCommand, site } from '../src/content/site'
import { readStack, type StackFacts } from '../src/content/stack'
import { docHref, quickstartHref } from '../src/docs/registry'

const communities = [
  { name: 'Developers', slug: 'developers', body: 'A community that lives alongside your code.' },
  {
    name: 'Open-source projects',
    slug: 'open-source',
    body: 'Questions and ideas with a home beyond the issue tracker.',
  },
  {
    name: 'Communities',
    slug: 'communities',
    body: 'Shared interests. Familiar names. Conversations that last.',
  },
  {
    name: 'Clubs and associations',
    slug: 'clubs-and-associations',
    body: 'A place for members, plans and everything that keeps a club going.',
  },
] as const

const technologies = [
  {
    key: 'node',
    name: 'Node.js',
    body:
      'One runtime runs the board, the background worker and the operator CLI, from a single ' +
      'shared codebase.',
  },
  {
    key: 'typescript',
    name: 'TypeScript',
    body:
      'Typed end to end. Themes, plugins, the API and the board’s own configuration are ' +
      'contracts the compiler checks before anything ships.',
  },
  {
    key: 'next',
    name: 'Next.js',
    body:
      'Rendered on the server with React Server Components, so the board opens fast on any ' +
      'device. Most reading and posting works with JavaScript switched off in the browser. ' +
      'Scripts only enhance what already works.',
  },
  {
    key: 'baseUi',
    name: 'Base UI',
    body:
      'shadcn/ui’s component vocabulary on Base UI primitives, styled with Tailwind CSS — ' +
      'accessible out of the box and open to any theme. The default theme is built from it.',
  },
  {
    key: 'postgres',
    name: 'PostgreSQL',
    body:
      'One database holds it all — posts, full-text search, sessions, queues and scheduled ' +
      'work — behind Drizzle ORM and versioned migrations. Nothing else is required; Redis is ' +
      'optional, for scaling out.',
  },
] as const satisfies readonly {
  readonly key: keyof StackFacts
  readonly name: string
  readonly body: string
}[]

export default async function LandingPage() {
  const stack = await readStack()

  return (
    <div className="editorial-home">
      <section className="edition-hero" aria-labelledby="home-heading">
        <div className="shell">
          <div className="edition-running-head">
            <p>OPEN-SOURCE FORUM SOFTWARE</p>
            <a href={site.repository}>
              BUILT IN THE OPEN <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="edition-hero-title">
            <h1 id="home-heading">
              <span>Long live</span> <em>the forum.</em>
            </h1>
          </div>
          <div className="edition-hero-grid">
            <div className="edition-hero-copy">
              <p className="edition-hero-lede">A proper home for your community.</p>
              <p>
                Meith is open-source, self-hosted forum software. Discussions, search and
                moderation, on your domain, with your data under your control.
              </p>
            </div>
            <div className="edition-hero-actions">
              <div className="edition-actions">
                <Link className="edition-button" href={quickstartHref()}>
                  Start your forum <span aria-hidden="true">↗</span>
                </Link>
                <ForumLink className="edition-text-link" href={site.demo}>
                  Try the demo <span aria-hidden="true">↗</span>
                </ForumLink>
              </div>
              <p className="edition-hero-note">
                Free software. No licence fee. No per-member pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="edition-band" aria-labelledby="keeps-heading">
        <div className="shell">
          <div className="edition-split edition-section-intro">
            <div className="edition-section-title">
              <p className="edition-label">BUILT FOR KEEPS</p>
              <h2 id="keeps-heading">
                A conversation today.
                <br />A resource <em>tomorrow.</em>
              </h2>
            </div>
            <p className="edition-copy">
              The answer someone gave. The guide somebody wrote. The decision you made together.
              Give your community a place where those things stay useful, and the next person can
              find them.
            </p>
          </div>
          <div className="edition-feature-grid">
            <Link href={docHref('member-guide')}>
              <span className="edition-label">01 / KEEP THE CONTEXT</span>
              <h3>
                Threads worth returning to <span aria-hidden="true">↗</span>
              </h3>
              <p>
                Posts in the order they were written. A link you can share. An archive that grows
                with your community.
              </p>
            </Link>
            <Link href={docHref('moderation-guide')}>
              <span className="edition-label">02 / SET THE TONE</span>
              <h3>
                Tools for the people in charge <span aria-hidden="true">↗</span>
              </h3>
              <p>
                Reports, moderation queues and forum permissions help your team look after the space
                you share.
              </p>
            </Link>
            <Link href={docHref('architecture')}>
              <span className="edition-label">03 / KEEP IT ACCESSIBLE</span>
              <h3>
                A forum that gets out of the way <span aria-hidden="true">↗</span>
              </h3>
              <p>
                Pages render on the server. Most reading and posting works with JavaScript switched
                off, on a phone or a desktop.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section className="edition-band edition-own" aria-labelledby="own-heading">
        <div className="shell edition-split">
          <div className="edition-section-title edition-sticky">
            <p className="edition-label">OWNERSHIP, IN PRACTICE</p>
            <h2 id="own-heading">
              Your community.
              <br />
              All the way <em>down.</em>
            </h2>
            <p className="edition-copy">
              Run Meith on infrastructure you control. You choose the domain, the host and the
              people who look after it. The whole project is MIT licensed.
            </p>
            <a className="edition-text-link" href={licenceHref}>
              Read the licence <span aria-hidden="true">↗</span>
            </a>
          </div>
          <ol className="edition-ownership-list">
            <li>
              <span className="edition-label">01</span>
              <div>
                <h3>Your domain. Your server.</h3>
                <p>
                  No Meith-hosted control plane or account with a company in the middle. You decide
                  where your board runs.
                </p>
              </div>
            </li>
            <li>
              <span className="edition-label">02</span>
              <div>
                <h3>Your data. Yours to move.</h3>
                <p>
                  Posts and members live in your PostgreSQL database. Back it up, move hosts or take
                  it with you.
                </p>
              </div>
            </li>
            <li>
              <span className="edition-label">03</span>
              <div>
                <h3>No charge for growing.</h3>
                <p>
                  No licence fee or per-member bill from Meith. You pay for your hosting and any
                  services you choose to connect.
                </p>
              </div>
            </li>
            <li>
              <span className="edition-label">04</span>
              <div>
                <h3>A future beyond one organiser.</h3>
                <p>
                  Hand over the roles and infrastructure when the people running it change. The
                  board stays with the community.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="edition-band" id="customise" aria-labelledby="customise-heading">
        <div className="shell">
          <div className="edition-split edition-section-intro">
            <div className="edition-section-title">
              <p className="edition-label">MAKE IT YOURS</p>
              <h2 id="customise-heading">
                Same foundations.
                <br />
                Your <em>expression.</em>
              </h2>
            </div>
            <div className="edition-copy">
              <p>
                Start with a theme. Make one of your own. Add plugins for the things your people
                need. A board should feel like the community that runs it.
              </p>
              <Link className="edition-text-link" href="/extensions">
                Browse themes and plugins <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
          <div className="edition-split edition-customise-content">
            <div className="edition-product" id="product">
              <ThemeShowcase />
              <p className="edition-small">Live forum components. Sample content.</p>
            </div>
            <nav className="edition-extension-links" aria-label="Customise Meith">
              <Link href={docHref('themes')}>
                <h3>Build a theme</h3>
                <span aria-hidden="true">↗</span>
                <p>Use typed slots and shared tokens to give your board its own identity.</p>
              </Link>
              <Link href={docHref('plugins')}>
                <h3>Write a plugin</h3>
                <span aria-hidden="true">↗</span>
                <p>Add features through documented hooks and extension points.</p>
              </Link>
              <Link href={docHref('api')}>
                <h3>Connect through the API</h3>
                <span aria-hidden="true">↗</span>
                <p>Bring Meith into your existing tools and workflows.</p>
              </Link>
            </nav>
          </div>
        </div>
      </section>

      <section className="edition-band edition-audiences" aria-labelledby="audiences-heading">
        <div className="shell edition-split">
          <div className="edition-section-title">
            <p className="edition-label">WHO IT’S FOR</p>
            <h2 id="audiences-heading">
              Different people.
              <br />
              Common <em>ground.</em>
            </h2>
            <p className="edition-copy">
              For people building something together, and looking for a place to keep it.
            </p>
            <ForumLink className="edition-text-link">
              Join the Meith community <span aria-hidden="true">↗</span>
            </ForumLink>
          </div>
          <div className="edition-audience-list">
            {communities.map((community) => (
              <Link key={community.slug} href={`/who-its-for/${community.slug}`}>
                <h3>{community.name}</h3>
                <p>{community.body}</p>
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="edition-band edition-stack" aria-labelledby="stack-heading">
        <div className="shell">
          <div className="edition-split edition-section-intro">
            <div className="edition-section-title">
              <p className="edition-label">UNDER THE HOOD</p>
              <h2 id="stack-heading">
                Built on the latest
                <br />
                <em>technology.</em>
              </h2>
            </div>
            <div className="edition-copy">
              <p>
                A TypeScript codebase, server-rendered pages and PostgreSQL for storage, search and
                background work. Configuration, themes and plugins live in your board’s repository.
              </p>
              <Link className="edition-text-link" href={docHref('architecture')}>
                How it fits together <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
          <ul className="edition-stack-grid">
            {technologies.map((technology) => (
              <li key={technology.key}>
                <div>
                  <h3>{technology.name}</h3>
                  <span
                    className="edition-stack-version"
                    title={`Version ${stack[technology.key]}`}
                  >
                    {stack[technology.key]}
                  </span>
                </div>
                <p>{technology.body}</p>
              </li>
            ))}
          </ul>
          <p className="edition-small">
            Major versions read from the repository when this page is built.
          </p>
        </div>
      </section>

      <section className="edition-band edition-start" aria-labelledby="start-heading">
        <div className="shell edition-split">
          <div className="edition-section-title">
            <p className="edition-label">OVER TO YOU</p>
            <h2 id="start-heading">
              Start something
              <br />
              <em>worth keeping.</em>
            </h2>
            <p className="edition-copy">
              Try a board on your own machine. Make it yours, then give your community the keys.
            </p>
          </div>
          <div className="edition-start-actions">
            <p className="edition-label">YOUR FIRST BOARD STARTS HERE</p>
            <CommandLine command={scaffoldCommand} />
            <p className="edition-small">
              The local preview uses sample data. Going live means arranging a domain, hosting and
              PostgreSQL. Follow the deployment guide for setup and ongoing operation.
            </p>
            <div className="edition-actions">
              <Link className="edition-button" href={quickstartHref()}>
                Start your forum <span aria-hidden="true">↗</span>
              </Link>
              <Link className="edition-text-link" href={docHref('deployment')}>
                Deployment guide <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
