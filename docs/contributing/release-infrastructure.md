# Release infrastructure

## Artifacts

| Artifact | Policy |
|---|---|
| `ghcr.io/meith-dev/meith:X.Y.Z` | Immutable board image for amd64/arm64; web, worker, migrator and CLI |
| `meith:X.Y`, `meith:latest` | Floating convenience tags; shipped deployments use exact versions |
| `ghcr.io/meith-dev/meith-base:X.Y.Z` | Exact framework dependency image for custom boards |
| Public workspace packages | Published to npm at the release version |
| `release` branch | Fast-forwarded to the released tag |
| GitHub release | Drafted automatically; maintainer completes and publishes |
| Template repositories | Mirrored from committed generated trees and tagged |

Never re-push immutable version tags.

## The version policy

| Bump | Contents | Migrations |
|---|---|---|
| Patch | Fixes | None |
| Minor | Features and additive changes | Allowed; prefer additive |
| Major | Removals, renames, destructive backfills | Allowed; document staged deployment if needed |

A fix needing a migration requires a minor release. This is maintainer policy, not an automated migration/version comparison. Upgrades span at most two majors. Downgrades are refused; recovery uses a backup restore.

## One version, everywhere

All workspace manifests share the root version. `release:check` also validates source version constants, plugin manifests, first-party marketplace listings, the compose pin and the publishable dependency closure. Its `--tag` mode checks tag/tree agreement.

Generated OpenAPI, installer, feed and template versions are checked by their generators. `pnpm release:bump` updates the version sources and generated output. Feature changes never move versions.

Images carry `MEITH_VERSION` and OCI metadata. Local builds default to `0.0.0-dev`.

## What publishes to npm

Every workspace package without `private: true` publishes. Public dependencies, peers and optional dependencies must form a closed set: none can require a private workspace package.

`scripts/npm-publish.mjs` orders dependencies before dependents, skips existing versions and holds back packages whose dependencies cannot publish. It uses pnpm to pack and rewrite `workspace:` ranges, then npm for registry publication and trusted publishing.

The dry run packs and checks every `files` entry and `bin` target without publishing. Build `create-meith` first so its bundled `dist/bin.mjs` exists. Other framework/theme/plugin packages ship TypeScript source compiled by the consuming board; keep their transpilation and Tailwind source discovery configured.

Generated boards pin engine packages exactly. `create-meith update` changes those pins explicitly. Extension API compatibility is separate from the package release version.

## Registry authentication

Each existing npm package configures GitHub Actions trusted publishing for organisation `meith-dev`, repository `meith`, workflow `release.yml`. Renaming that workflow requires updating every publisher configuration.

First publication is a maintainer operation. Substitute the package directory/name:

```sh
npm login
cd themes/clubhouse
pnpm pack --out /tmp/pack.tgz
npm publish /tmp/pack.tgz --access public
npm trust github @meith/theme-clubhouse \
  --repo meith-dev/meith --file release.yml --allow-publish
```

Use pnpm to pack so `workspace:` ranges become registry ranges. npm handles login, publication and trusted-publisher setup. Use a current npm release for [`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust/). The package settings page is an alternative for configuring trust.

Complete first publication before tagging. If done afterward, rerun the release workflow to publish missing packages and their dependents.

## Deploy templates

`templates/self-host` and `templates/vercel` are generated from `create-meith` during a release. They mirror to `meith-dev/template` and `meith-dev/vercel-template`. Normal feature CI checks generator behaviour without requiring released snapshots to match unreleased scaffold changes.

The mirror owns the entire tracked destination tree, including deletions. Add required files to the scaffold, not directly to a template repository. Synchronisation is idempotent and tags each repository `vX.Y.Z`.

The updater uses those tags to distinguish generated files from operator edits. Missing tags degrade updates to manual deploy-file review even when package versions can move.

Create an organisation GitHub App with **Contents: read/write** and **Workflows: read/write**, installed on both template repositories. Store `TEMPLATE_SYNC_APP_ID` and `TEMPLATE_SYNC_APP_PRIVATE_KEY` in this repository. The job creates a scoped installation token and passes it as `TEMPLATE_SYNC_TOKEN`.

Without these secrets, synchronisation warns and skips. Inspect that job rather than treating overall release success as proof that templates moved. Mark `meith-dev/template` as a template repository.

## Deployment pins

Stock deployments use exact image versions. Pin `MEITH_IMAGE` per resource so a hosting-panel restart/redeploy cannot silently follow a moved release branch. Custom boards track exact package pins and receive update pull requests or run the updater manually. meith.dev deploys from `main`.

Docker base images use digests maintained by Dependabot under `docker/`. Scripts needing the same images read those pins through `pinnedComposeImage`. Workflow actions use full commit SHAs. Disposable PostgreSQL job-service containers use the bare version tag because that workflow block is outside the digest update mechanism.

## Release push credentials

The cut workflow needs a write-enabled deploy key to push through the `main` ruleset and trigger the tag workflow.

1. Generate an SSH key with `ssh-keygen -t ed25519 -f meith-release -N ""`.
2. Add its public half under **Settings → Deploy keys**, with write access.
3. Store the private half as `RELEASE_DEPLOY_KEY` in Actions secrets.
4. Add **Deploy keys** to the ruleset bypass list for `main`.
5. Delete the local key files after storing both halves securely.

A `GITHUB_TOKEN` tag push does not trigger the release workflow. Rerunning the cut workflow skips already-completed bump, commit and tag steps.

## Initial registry setup

Make the GHCR packages public after first publication so operators can pull them. Create the npm scope and publish each package once, then configure trusted publishing. Protect the `release` branch from manual pushes.

Use [Release Meith](release.md) for the regular procedure.
