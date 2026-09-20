# Release Meith

Maintainers publish an immutable `vX.Y.Z` tag from a passing commit of `main`. Operators should use [Upgrade Meith](../operations/upgrading.md).

## Prepare

Confirm CI passes. Choose a version using the [release policy](release-infrastructure.md#the-version-policy). Review migrations, compatibility and required operator actions. Configure first publication for any new npm packages before cutting the release.

## Publish

1. Run **Actions → Cut a release** with `X.Y.Z`, without `v`.
2. Wait for the version bump, generation, validation, commit and tag.
3. Check every Release workflow job, including images, npm packages, generated-board smoke tests and template synchronisation.
4. Complete the draft GitHub release with migration requirements, deployment steps, behaviour changes and known limitations. Publish it.

Do not move an existing tag or overwrite an immutable image. Fix a broken release in a new version. For interrupted publication, investigate and rerun the supported workflow; it skips already-published versions.

A skipped first npm publication can block dependent packages and downstream artifacts. See [Release infrastructure](release-infrastructure.md).
