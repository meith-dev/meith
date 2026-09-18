# Start here

Meith is forum software for running your own community. Members read discussions, write posts and send messages; moderators look after conversations; administrators manage the community; operators maintain the hosting.

## Choose what you want to do

| I want to… | Start with |
|---|---|
| See how Meith works | [Try a local preview](quickstart.md) |
| Join or use an existing board | [Member guide](../members/member-guide.md) |
| Set up hosting | [Choose a deployment](../operations/deployment.md) |
| Open a newly installed community | [Launch checklist](../administration/first-steps.md) |
| Manage members, forums or moderation | [Community administration](../administration/organiser-guide.md) |
| Maintain an existing server | [Server operations](../operations/operating.md) |
| Move from another forum | [Import MyBB or phpBB](../operations/migrating.md) |
| Build a plugin or theme | [Build extensions](../extensions/extensions.md) |
| Connect another application | [Make your first API request](../integrations/api-quickstart.md) |
| Work on Meith's source code | [Contribute to Meith](../contributing/development.md) |

## Learn the vocabulary

A **board** is one community's website. A **category** groups related forums. A **forum** contains **threads**, and a thread contains the opening **post** and its replies. A **group** gives members permissions and allowances.

An **administrator** manages the board through its admin panel. A **moderator** has permission to manage content in particular forums. An **operator** looks after deployment, backups and infrastructure. One person can hold several roles, but each role has a different set of tasks.

## Understand what you install

A board repository chooses the Meith version, themes and plugins. PostgreSQL stores community data. Uploaded files need persistent storage and their own backup coverage. A worker or scheduled tick processes background work.

A **theme** changes presentation. A **plugin** adds capabilities such as a calendar, awards or paid memberships. Features available on a board depend on what its operator has installed and enabled.

Most reading and posting works without JavaScript. Optional enhancements include previews, suggestions and browser notifications.

For the technical layout, read [Architecture](../contributing/architecture.md).
