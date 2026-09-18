# Change the board appearance

Change the board name, logo, theme, colors and fonts through the admin panel. You need permission to administer the board; installing a new theme package also needs an operator.

## Making the board look like yours

Everything in this section changes on the running board, from the panel,
with nothing redeployed.

### The name

The board's name — in the header, in every page title, and on outgoing
mail — is **Board name** under **`/admin/settings?group=board`**. There
is nowhere else it is written down, so changing it there changes it
everywhere.

### The logo

**Admin → Themes** (**`/admin/themes`**) takes a logo to show in place
of the name, as **two uploads: light and dark** — one image that reads
on a white page usually disappears on a black one. Upload only the light
one and it is used everywhere. PNG, JPEG, WebP or SVG, up to 512 KiB.

With no logo, the header shows the board's name in text — which is where
every board starts and where most stay. The logo's alt text, for screen
readers, is **Logo alt text** under the board settings; left empty it
becomes the board's name.

### The tab icon, home-screen icon and shared links

The browser-tab icon (favicon), the icon a phone saves when someone adds
the board to their home screen, and the picture that appears when a board
link is pasted into a chat or posted to a social network are **drawn from
what you have already set** — the board name, the default theme's colours,
and the logo when there is one — unless you upload a favicon of your own.

- The **favicon** is **Favicon** under **`/admin/settings?group=board`**,
  the same square icon field the logo sits beside on the themes page —
  PNG, JPEG, WebP or SVG, up to 512 KiB. Leave it empty and the **tab
  icon** is a small square with the board's initials in the theme's
  primary colour, following the reader's light or dark mode; upload one
  and it is shown instead.
- The **home-screen icon** — the board installs as a progressive web app
  — uses the uploaded favicon when it is a PNG or JPEG, otherwise the
  light logo, otherwise the initials, centred on the theme background.
- The **link preview** (Open Graph and X/Twitter card) shows the logo,
  the board name and its description on the theme background.

Change the name, upload a favicon or a logo, or set a new default theme
and all of these follow at once; there is no separate step and no cache to
clear. The raster home-screen icons are drawn from a PNG or JPEG only — an
SVG or WebP favicon still shows in the browser tab, and the home-screen
icons fall back to the logo, then to the board's initials and name.

Installing is something a reader has to discover in their browser's menu,
so the board can point at it for you: **Offer to install the board**, under
**`/admin/settings?group=board`**, pins a dismissable bar to the bottom of
small screens inviting the reader to add the board to their home screen —
with an Install button that opens the browser's own prompt where one
exists, and brief directions where none does. It never shows inside the
installed app, dismissing it keeps it away on that device for a year, and
it is off by default: turn it on while you want installs encouraged, and
off again once the point is made.

### Colours, fonts and themes

The same **Admin → Themes** screen holds, per theme:

- **On or off** — an enabled theme appears in the appearance control at
  the foot of every page, and any member can pick it for themselves.
- **The default** — what a visitor who has chosen nothing sees.
- **Token values** — colours, corner radius, spacing and fonts, each
  with separate light and dark values, with a sample that repaints as
  you change them.
- **Export and import** — a look can be saved as a file and moved to
  another board.

Most controls here are freely reversible. **Reset** and **Import** are
the exceptions — each replaces every stored override in one press — so
both ask for your password again.

If your community has a crest and two colours — a sports club, say —
the shipped **clubhouse** theme is built for exactly that: set the main
colour and the trim colour on the theme screen and everything else
stays neutral. With no logo uploaded it draws a crest from the board's
name.

> [!NOTE]
> *Configuring* a theme is yours; *installing* a new one is not. A theme
> is part of the deployed code, so adding one is a deploy — see the
> [last section](manage-members.md#when-to-hand-it-to-somebody-technical).
