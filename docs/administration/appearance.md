# Appearance

## Name and images

Set **Board name**, description and **Logo alt text** at `/admin/settings?group=board`. Empty logo alt text uses the board name.

Upload light and dark logos at **Admin → Themes** (`/admin/themes`). PNG, JPEG, WebP and SVG are accepted up to 512 KiB. If only a light logo exists, both modes use it. Without a logo, the header displays the name.

Set **Favicon** under Board settings or on the themes page. It accepts the same formats and limit.

| Asset | Fallback |
|---|---|
| Browser icon | Board initials in the default theme colour |
| Home-screen icon | PNG/JPEG favicon, usable light logo, then initials |
| Shared-link image | Logo, board name and description on the theme background |

Generated assets follow identity and default-theme changes. SVG/WebP favicons still work in the browser tab but are not rasterized for home-screen icons.

## Themes and tokens

At **Admin → Themes**:

- Enable themes members may choose.
- Set the default for visitors without a selection.
- Edit light/dark colours, fonts, radius and spacing; check the preview.
- Export overrides to a file or import them on another board.

**Reset** and **Import** replace all stored overrides and require password confirmation. Panel changes do not require deployment. [Installing another theme](../operations/installing.md) does.

The Clubhouse theme provides primary and trim colours and generates a crest when no logo is uploaded.

## Installation prompt

Enable **Offer to install the board** under Board settings to show a dismissible prompt on small screens. Supported browsers open their native install prompt; others show instructions. The prompt is hidden in the installed app. Dismissal lasts one year on that device. The setting is off by default.
