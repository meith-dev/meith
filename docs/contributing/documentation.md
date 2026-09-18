# Maintain the documentation

Documentation source lives in `docs/`. The website publishes these Markdown files and uses `apps/web/content/docs.manifest.json` for navigation, titles, summaries and reading order.

## Choose the reader and task

Put a page in one reader path: Start here, Use a community, Manage a community, Install and operate, Build extensions, Use the API, or Contribute to Meith. Use the directory for that audience. Generated contract files remain under `reference/` and appear in the appropriate reader section.

A tutorial teaches one working path. A task guide explains a concrete operation. A reference defines fields, commands or rules. An explanation describes why a system behaves as it does. Keep these purposes separate when their audiences or prerequisites differ.

Before adding a page, look for the existing home of the topic. Add a link to that home rather than repeating its full explanation elsewhere.

## Write a usable page

Start with the outcome, required access and prerequisites. Use numbered steps for procedures and include a way to check success. State where a command runs: source checkout, board repository, container or hosting panel.

Use the actual UI labels, concrete examples and descriptive headings. Explain unfamiliar terms on first use. Keep implementation reasoning in contributor explanations and reference pages; keep member instructions focused on what the member can do.

Preserve security, permission and recovery constraints. Put destructive-operation warnings immediately before the action. Confirm commands and limits against implementation and tests; recheck provider-specific facts against official documentation.

Use ordinary Markdown, fenced code, tables and supported callouts. Raw HTML is escaped by the site. H2 and H3 headings appear in the contents and search index. Include important command names and setting keys in prose or tables because fenced code is omitted from search text.

## Register and link the page

1. Add the Markdown file under its reader directory.
2. Add its manifest entry with a unique slug, title, blurb, section and optional group. Each section has one primary page.
3. Link to related pages with relative Markdown paths so links work on GitHub and the website.
4. Run `pnpm site:docs` to regenerate the index in `docs/README.md`.
5. Update links and site calls to action when moving or renaming a topic.

The docs home gives each reader a starting point and an expandable complete index. Previous/Next stays inside the current reader path. Long pages have a desktop contents rail and a mobile contents control. No historical anchor redirects are maintained: update callers when restructuring a page.

## Update generated references at source

| Reference | Source | Command |
|---|---|---|
| Theme slots and models | `packages/theme-kit/src/{slots,api,view-models}.ts` | `pnpm theme:docs` |
| Plugin hooks | `packages/plugin-kit/src/{hooks,payloads,regions}.ts` and call sites | `pnpm plugin:docs` |
| REST API and OpenAPI | `packages/api/src/` registry, schema and reference renderer | `pnpm api:docs` |
| Performance | Recorded results and `packages/testkit/src/load/` budgets | `pnpm perf:docs` |
| Documentation index | Documentation manifest | `pnpm site:docs` |

Never hand-edit generated output. The six theme/plugin source files above are the explicit exception to the no-inline-comments rule because their prose becomes published reference material.

Deploy template READMEs are generated from `packages/create-meith/src/scaffold.ts` with `pnpm templates:gen`. Extension README text is in `scaffold-extension.ts`; example source templates are regenerated with `pnpm extension:gen`.

## Verify the result

```sh
pnpm docs:index:check
pnpm docs:links:check
pnpm site:docs:check
pnpm site:build
pnpm comments:check
```

Run `pnpm verify` before a PR. Preview with `pnpm site:dev`; inspect the affected pages on desktop and phone widths, follow the steps as the intended reader, and try the words they would search for. A passing link check does not prove a procedure is understandable or correct.

Keep GitHub entry READMEs short and point them at the canonical docs. Do not add separate long-form manuals inside packages.
