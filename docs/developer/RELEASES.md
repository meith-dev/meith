---
title: Release process
description: How maintainers publish meith with Release Please, Conventional Commits, protected main, and automated desktop artifacts.
section: Developers
sectionOrder: 2
order: 70
slug: developers/releases
---

# Release process

meith releases are automated with the `release-please` package and are based on
Conventional Commit history. Maintainers should not push version bumps, release
commits, or artifact changes directly to `main`.

## Commit requirements

Every pull request must use Conventional Commits for both its title and commits.
The `Commit Messages` workflow runs `commitlint` on the PR title and every PR
commit. Common examples:

```text
feat(renderer): add split preview controls
fix(cli): ignore stale runtime sockets
docs: refresh plugin guide
chore(release): release meith v0.1.3
```

Use `!` or a `BREAKING CHANGE:` footer for breaking changes. Release Please uses
those commit messages to choose the next SemVer version and to build release
notes.

## Release PR flow

The `Release` workflow runs on every push to `main`.

1. `pnpm release:github` asks Release Please to create a GitHub Release if the
   just-merged commit is a Release Please PR.
2. `pnpm release:pr` creates or updates the next Release Please PR.
3. When a new `vX.Y.Z` tag points at the current commit, CI builds the macOS
   arm64 desktop package and uploads the DMG, ZIP, blockmaps, and checksum file
   to that GitHub Release.

Release Please owns these files during a release PR:

- `package.json`
- `apps/web/package.json`
- `packages/*/package.json`
- `packages/desktop/package.json` `build.mac.bundleVersion`
- `.release-please-manifest.json`
- `CHANGELOG.md`

## Maintainer checklist

1. Merge normal feature and fix work through PRs only.
2. Wait for the Release Please PR to update after those PRs land.
3. Review the generated version bump and changelog.
4. Merge the Release Please PR to publish.
5. Confirm that the release workflow uploaded the macOS artifacts and
   `meith-<version>-checksums.txt`.

For local validation, use dry runs with a GitHub token:

```bash
pnpm release:pr --dry-run --token="$RELEASE_PLEASE_TOKEN"
pnpm release:github --dry-run --token="$RELEASE_PLEASE_TOKEN"
```

## Repository protection

The `main` branch must be protected so maintainers cannot bypass the PR-based
release flow. Force pushes and branch deletion are disabled. Pull requests,
linear history, and the `Validate Conventional Commits` status check are
required before changes can land on `main`. Use a Conventional Commit PR title
if the branch will be squash-merged.

The release workflow requires a `RELEASE_PLEASE_TOKEN` repository secret. The
default `GITHUB_TOKEN` is not sufficient when the organization blocks GitHub
Actions from creating pull requests. Use a fine-grained personal access token or
GitHub App token with write access for contents, pull requests, and issues.
