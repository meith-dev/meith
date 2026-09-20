# Maintain documentation

Source lives in `docs/`. The website renders the same files; `apps/web/content/docs.manifest.json` defines navigation and metadata.

## Writing rules

Write neutral instructions. Start with the task and prerequisites, then the steps and a way to check the result. Remove introductions, opinions, promotional language and repeated explanations. Keep setup guides complete from prerequisites through verification. Documentation checks must not impose minimum prose lengths.

Use actual UI labels and commands verified against the code. State where commands run. Default to pnpm in the Meith workspace. Use npm for generated boards, whose tooling requires it, and for npm-specific publishing operations.

Use short headings, numbered procedures and tables for fields or limits. Link to existing explanations instead of repeating them. Keep security boundaries, access requirements, data-loss warnings and recovery steps beside the relevant action.

Markdown, fenced code and tables are supported. Raw HTML is escaped. H2/H3 headings appear in contents and search; code fences are excluded from search text, so mention important commands and keys in prose too.

## Add or move a page

1. Put the file in its audience directory.
2. Register its unique slug, title, short blurb, section and optional group in the manifest. Each section has one primary page.
3. Use relative Markdown links between documents.
4. Run `pnpm site:docs` to update `docs/README.md`.
5. Update links and anchors in callers, including website content.

The docs home lists the guides. Previous/Next stays within the section. Long pages have desktop and mobile contents navigation. Historical heading anchors are not redirected.

## Generated references

| Reference | Source | Command |
|---|---|---|
| Theme slots/models | `packages/theme-kit/src/{slots,api,view-models}.ts` | `pnpm theme:docs` |
| Plugin hooks/regions | `packages/plugin-kit/src/{hooks,payloads,regions}.ts` and call sites | `pnpm plugin:docs` |
| REST/OpenAPI | `packages/api/src` registry, schema and renderer | `pnpm api:docs` |
| Performance | Recorded results and load-test budgets | `pnpm perf:docs` |
| Index | Documentation manifest | `pnpm site:docs` |

Edit sources, then regenerate. The six theme/plugin files are exceptions to the no-inline-comments rule because their prose is published documentation.

Deploy README templates come from `packages/create-meith/src/scaffold.ts` through `pnpm templates:gen` at release time. Extension README templates live in `scaffold-extension.ts`; `pnpm extension:gen` updates the example source templates.

## Validate

Run `pnpm docs:index:check`, `pnpm docs:links:check`, `pnpm site:docs:check`, `pnpm site:build` and `pnpm comments:check`. Run `pnpm verify` before a PR.

Preview with `pnpm site:dev`. Check desktop and phone layouts, links, contents and search. Follow the procedure as its intended reader. Keep package/root READMEs short and link to canonical docs.
