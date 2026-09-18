# Release Meith

This procedure is for maintainers publishing Meith. Board operators should use [Upgrade Meith](../operations/upgrading.md). A release is an immutable `vX.Y.Z` tag on a passing commit of `main`.

## Before releasing

Confirm `main` passes CI, choose the version according to the [version policy](release-infrastructure.md), and check any one-time publishing setup. Feature PRs do not change versions.

Review migrations, compatibility and operator action required by the release. Make sure new public packages have the registry setup described in [Release infrastructure](release-infrastructure.md).

## Cut the release

1. Run **Actions → Cut a release** with `major.minor.patch`, without the leading `v`.
2. Wait for the workflow to bump versions, regenerate stamped output, validate, commit and push the tag.
3. Wait for the Release workflow to build, boot-test and publish its artifacts.
4. Inspect the draft GitHub release. Fill in the migration information and explain the action an operator must take, then publish it.

Do not move an existing tag. A failed publication should be investigated and resumed through the supported workflow, not repaired by making the same version refer to different source.

## Check the published artifacts

The workflow checks tag/tree agreement, builds and boots board images against PostgreSQL, publishes npm packages in dependency order, builds the base image from published packages, and smoke-tests a generated board from the real registry. It also updates the release branch and drafts release notes.

Inspect every job result. A new package skipped because it has not had its first registry publish can prevent downstream artifacts from being usable even when earlier jobs succeeded.

## Write useful release notes

State whether migrations run, which deployment or extension steps are required, and any behavior or default changes users will notice. Include known limitations and recovery implications. Link to [Upgrade Meith](../operations/upgrading.md) for the standard procedure instead of repeating it.

The detailed package, authentication, image and template rules are in [Release infrastructure](release-infrastructure.md).
