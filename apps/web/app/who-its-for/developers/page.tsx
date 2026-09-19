import type { Metadata } from 'next'
import Link from 'next/link'

import { CommandLine } from '../../../src/components/command-line'
import { Breadcrumb, ClosingBand } from '../../../src/components/site-bands'
import { Terminal } from '../../../src/components/terminal'
import { developers } from '../../../src/content/developers'
import { readFacts } from '../../../src/content/facts'
import { audienceHref, audienceIndexHref } from '../../../src/content/segments'
import { devTerminal, scaffoldCommand, site } from '../../../src/content/site'
import { docHref, quickstartHref } from '../../../src/docs/registry'
import { ogImage } from '../../../src/og/card'

const canonical = audienceHref(developers.slug)

export const metadata: Metadata = {
  title: { absolute: developers.meta.title },
  description: developers.meta.description,
  alternates: { canonical },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: developers.meta.title,
    description: developers.meta.description,
    url: `${site.url}${canonical}`,
    images: ogImage(`${audienceIndexHref}/og/${developers.slug}`, developers.meta.title),
  },
  twitter: {
    card: 'summary_large_image',
    title: developers.meta.title,
    description: developers.meta.description,
  },
}

const capabilities = [
  {
    title: 'Configure in code.',
    body: 'Typed configuration. Pinned versions. A deployment you can review, repeat and roll back.',
    doc: 'configuration',
    label: 'Meet your board repository',
  },
  {
    title: 'Build without the setup.',
    body: 'Fixture mode gives you a realistic board without PostgreSQL or Docker. Start exploring immediately.',
    doc: 'quickstart',
    label: 'Start developing',
  },
  {
    title: 'Extend what matters.',
    body: 'Custom themes, plugin hooks and a scoped REST API. Documented contracts, all the way through.',
    doc: 'first-plugin',
    label: 'Build your first plugin',
  },
] as const

export default async function DevelopersPage() {
  const facts = await readFacts()
  const startHref = quickstartHref()

  return (
    <div className="marketing-page">
      <section className="shell marketing-hero">
        <Breadcrumb
          current={developers.name}
          trail={[
            { label: site.name, href: '/' },
            { label: 'Who it’s for', href: audienceIndexHref },
          ]}
        />
        <div className="marketing-developer-hero">
          <div>
            <p className="eyebrow">Built for developers</p>
            <h1 className="marketing-title">
              Your community,
              <br />
              <span>version controlled.</span>
            </h1>
            <p className="marketing-lead">
              A forum that fits your stack. Configure it in TypeScript, keep it in Git, deploy it on
              your terms.
            </p>
            <div className="marketing-actions">
              <Link className="btn btn-primary" href={startHref}>
                Start building <span aria-hidden>→</span>
              </Link>
              <a className="textlink" href={site.repository}>
                View on GitHub <span aria-hidden>↗</span>
              </a>
            </div>
          </div>
          <div className="marketing-developer-terminal">
            <Terminal content={devTerminal} />
            <CommandLine command={scaffoldCommand} />
          </div>
        </div>
      </section>

      <section className="shell marketing-section">
        <div className="marketing-values">
          {capabilities.map((capability, index) => (
            <article key={capability.doc}>
              <span className="marketing-number">0{index + 1}</span>
              <h2>{capability.title}</h2>
              <p>{capability.body}</p>
              <Link className="textlink" href={docHref(capability.doc)}>
                {capability.label} <span aria-hidden>→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="shell marketing-section marketing-contracts">
        <div className="marketing-section-heading">
          <p className="eyebrow">Room to make it yours</p>
          <h2>
            Small core.
            <br />
            Wide open possibilities.
          </h2>
          <p>Build your own themes and plugins on typed, versioned contracts.</p>
        </div>
        <dl className="marketing-stats">
          {developers.extensibility.counts(facts).map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
        <div className="marketing-resource-links">
          <Link href={docHref('themes')}>
            Theme guide <span aria-hidden>↗</span>
          </Link>
          <Link href={docHref('plugins')}>
            Plugin guide <span aria-hidden>↗</span>
          </Link>
          <Link href={docHref('api')}>
            API reference <span aria-hidden>↗</span>
          </Link>
          <Link href={docHref('performance')}>
            Performance benchmarks <span aria-hidden>↗</span>
          </Link>
        </div>
      </section>

      <ClosingBand
        heading="One command. Your community."
        body="Try a board locally, then give it a home."
        docsHref="/docs"
        startHref={startHref}
      />
    </div>
  )
}
