# Install plugins and themes

Add extensions in the board repository, then build and deploy. You need repository and deployment access. The admin panel manages installed extensions but cannot install new package code into a running container.

## Install a published plugin

Check the package's compatibility and permissions. From the generated board directory:

```sh
npm run meith -- plugin:add @meith/plugin-awards
```

The command installs the package, updates `board.plugins.json` and regenerates `meith.plugins.ts`. Commit the package, lockfile and registry changes. Rebuild and deploy through the board's normal route.

Apply plugin migrations with the deployed CLI's `meith upgrade`, or **Admin → System → Version & migrations** after core migrations have completed. `meith migrate` alone only handles core migrations.

Open **Admin → Plugins** to confirm the plugin is present and configure its settings. Verify a representative member flow.

## Install a theme

Install its exact package version, then add it to `meith.config.ts` using its exported theme, tokens, browser color and messages. Keep the existing theme entries you still need. The [first-theme tutorial](../extensions/first-theme.md#3-register-the-theme) shows the registry shape.

Set `defaultTheme` if appropriate, commit, rebuild and deploy. Check the theme under **Admin → Themes**, including mobile and light/dark appearance.

## Update an extension

Read its release notes, verify Meith compatibility and take a backup before schema changes. Update the package in the board checkout, review the lockfile, rebuild and deploy, then apply pending plugin migrations.

An update indication in the panel is information; it is not a background package installation.

## Disable or remove a plugin

Disabling a plugin stops its behavior but does not mean its data has been deleted. To remove its registration, use `meith plugin:remove <key>` in the board checkout, then commit and deploy.

If you intend to permanently delete its data, back up first and follow the plugin purge workflow while its code is still installed. Purge needs the plugin definition to run its uninstall lifecycle. Removing code first can prevent that cleanup.

For a stock image that cannot include your package, first [create a custom board](custom-board.md). To write an extension, start with [Build extensions](../extensions/extensions.md).
