# Publish a theme or plugin

Publish a tested extension package, then submit a listing for review. A marketplace listing describes compatibility; it does not prove that an extension is safe or compatible with every board.

## Prepare the package

Run its tests and typecheck, then install it into a disposable board and verify the documented features. Declare the package version and supported Meith/API range honestly. Check permissions, migrations, secret handling, translations and accessibility.

The scaffold includes `listing.json`. Replace placeholders such as the repository URL and provide a real screenshot. Publishing the npm package is a deliberate release action; follow your package's release process when ready.

## Complete the listing

| Field | Meaning |
|---|---|
| `kind` | `plugin` or `theme` |
| `key` | Stable extension key using the accepted key format |
| `package` | Published package name |
| `version` | The listed package's version |
| `apiVersion` | Theme-kit or plugin-kit major used |
| `meith` | Tested board-version range |
| `screenshots` | Filenames included in the repository's marketplace screenshots directory |

Third-party packages have their own version sequence. First-party listings track the repository release. The generator checks that ranges parse; you must establish actual compatibility through testing.

## Submit a pull request

1. Add the listing under `marketplace/listings/`.
2. Add the referenced images under `marketplace/screenshots/`.
3. Run `pnpm marketplace:gen` and inspect the resulting feed and assets.
4. Run `pnpm marketplace:gen:check` and the repository's required checks.
5. Explain the extension's behavior, permissions, compatibility and test results in the PR.

The feed serves reviewed local screenshots rather than arbitrary third-party image URLs. Unused screenshots and stale generated output fail the gate.

## Understand review and updates

A review considers the published source, requested capabilities, data access, migration behavior and whether the listing matches what the package does. A listing is not a sandbox or a guarantee against malicious future package releases.

For an update, publish and test the new package, then update the listing and compatibility evidence. Boards can report an available compatible update, but operators still choose to install and deploy it.

Operators should use [Install extensions](../operations/installing.md). Contributors maintaining the feed should use [Marketplace maintenance](../contributing/marketplace-maintenance.md).
