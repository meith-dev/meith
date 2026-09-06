# What is Meith?

Meith is open-source forum software. A community runs its own board, with
forums, discussions, member accounts, search, and moderation. It is written
in TypeScript and released under the MIT licence.

## The basics

- A **board** is the community's website.
- A **category** groups related forums.
- A **forum** holds discussions about a subject.
- A **thread** is a discussion, beginning with a post and followed by replies.
- A **group** gives its members permissions, such as access to a private forum.

Most reading and posting works without JavaScript. Features such as live
previews and mention suggestions add convenience when JavaScript is available.

## Who does what

| Role | Work | Guide |
|---|---|---|
| Member | Read, post, follow discussions, and manage an account | [Member guide](../guides/community/member-guide.md) |
| Moderator | Approve content, handle reports, and manage discussions | [Moderation](../guides/community/moderation-guide.md) |
| Administrator or organiser | Manage members, forums, permissions, and board settings | [Community administration](../guides/community/organiser-guide.md) |
| Operator | Deploy, update, monitor, and back up the board | [Server operations](../guides/operations/operating.md) |
| Developer | Build extensions or change Meith itself | [First plugin](../customization/first-plugin.md) or [Development](../contributing/development.md) |

One person can fill several roles. Access depends on the permissions granted
by the board, including appointments to moderate particular forums.

## What you install

A board repository pins the Meith engine and registers its themes and plugins.
PostgreSQL stores accounts, posts, permissions, and board settings. Uploaded
files live in a local volume or an object store and must be backed up too.
See [Board configuration](../guides/configuration.md) for the files involved.

Themes change the presentation. Plugins add features; paid memberships, for
example, use the **Dues** plugin and require payment setup.

## Start here

- To try Meith on your computer, use [Try Meith locally](./quickstart.md).
- To host a community, [choose a deployment](./deployment/index.md).
- If the board is already installed, [set up your community](./first-steps.md).
- If you are joining someone else's board, use the [Member guide](../guides/community/member-guide.md).
