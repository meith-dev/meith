# Marketplace maintenance

Extension authors should follow [Publish an extension](../extensions/marketplace.md).

## Generate and validate

```sh
pnpm marketplace:gen
pnpm marketplace:gen:check
```

The generator reads `marketplace/listings` and `marketplace/screenshots`, then writes the committed feed and images under `apps/web/public/marketplace`.

It validates kind, key, version, compatibility range, unique keys/packages and referenced screenshots. Images must have a PNG signature and be smaller than 5,000,000 bytes. The check rejects orphan source or output files; generation deletes them. Output is sorted by key and has no timestamp.

Keep `/marketplace/v1.json` compatible. Publish a changed schema at a new versioned path.

## Board update checks

The board fetches the configured `marketplace.feed_url` daily through `marketplace.refresh_catalog`, or on **Check for updates** in the plugin/theme panels. Fetch failures retain the last successful cache and appear in logs and the panel.

An installed extension is offered an update only when the feed version is newer and its Meith/API requirements match. The board does not install packages automatically.

Administrators receive `marketplace.update_available` once per key/version. An atomic claim prevents duplicate notices. The claim precedes delivery, so a failed notification is not retried; the panel still shows the available update.

## Fetch boundary

The URL setting accepts HTTPS and loopback HTTP. It is administrator-trusted and can target internal addresses; it is not a public-URL security boundary.

Fetches reject redirects and non-2xx responses, enforce the size cap while streaming and use a 10-second timeout. Retain these controls when changing the consumer.

## Delisting

Remove the listing and its unused screenshots, then regenerate the feed. Delist confirmed unsafe, unlicensed, unavailable or unmaintained packages according to review findings.

Delisting removes the public listing and feed entry. It does not uninstall or notify boards already running the package.

## First-party listings

Listings for workspace packages must match their manifest versions. `pnpm release:check` enforces this, and `pnpm release:bump` updates the feed. Third-party versions follow their own package releases.

Replace screenshots in the source directory and regenerate. Do not edit public output directly. Use [Testing](testing.md#screenshots) for captures; inspect the actual image before treating it as a current product screenshot.
