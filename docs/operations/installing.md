# Install extensions

Run package changes in the board repository, then commit, build and deploy. The admin panel cannot install package code.

## Plugin

```sh
npm run meith -- plugin:add @meith/plugin-awards
```

Review compatibility first. The command installs the dependency, updates `board.plugins.json` and regenerates `meith.plugins.ts`. Commit these and the lockfile, then deploy.

Run `meith upgrade` with the [deployed CLI](operator-cli.md), or apply plugin migrations under **Admin → System → Version & migrations** after core migrations finish. `meith migrate` handles core migrations only.

Check **Admin → Plugins**, configure settings and test the member flow.

## Theme

Use `npm install --save-exact <package>@<version>`. Register its theme, tokens, browser colour and messages in `meith.config.ts`; see the [registration example](../extensions/first-theme.md#3-register-the-theme). Set `defaultTheme` if needed, then commit and deploy. Check mobile, light and dark modes under **Admin → Themes**.

## Update or remove

Back up before schema changes. Update the package, review the lockfile, deploy and apply migrations. Panel update notices do not install code.

Disabling a plugin retains its data. `npm run meith -- plugin:remove <key>` removes registration; commit and deploy afterward.

To delete owned data permanently, back up and run the purge workflow while the plugin code is still installed. Removing code first prevents its uninstall hook from running.

Stock-image users must first [create a custom board](custom-board.md).
