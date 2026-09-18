# Set up your community

Complete this checklist after installation, using the administrator account you created. If the board is not running yet, start with [Choose a deployment](../operations/deployment.md).

## 1. Open the admin panel

Sign in and open `/admin`. Re-enter your password to start the panel's separate session. On a phone, open the panel menu to reach its sections.

## 2. Set the identity and rules

Under **Board settings → Board**, check the name, description and public address. Under **Themes**, select the default appearance and upload the logo. Use **Board settings → Legal** for the Rules & FAQ, terms and privacy pages.

Open the board while signed out to check the header, footer and published rules. [Board appearance](appearance.md) covers colors, fonts and images.

## 3. Prove email works

Open `/admin/settings?group=mail`, save the sending configuration and select **Send a test message to me**. Confirm receipt in the mailbox.

Only then choose the registration policy under `/admin/settings?group=registration`: open or closed, and whether accounts require email confirmation, administrator approval or both. Use [Email](../operations/mail.md) if the test fails.

## 4. Create the initial forums

Rename the first forum and add a small set of categories and forums at **Admin → Forums**. Give each a clear purpose. Follow [Forums and permissions](forums.md) for a private staff area.

Appoint moderators to the relevant forums and give them the [moderation guide](moderation-guide.md). Check which actions each appointment permits.

## 5. Test as an ordinary member

Create a test member account and sign out to test as a guest too. Verify that each sees the intended forums, that posting works where allowed, and that private forums stay private. Administrator bypasses can hide mistakes in permission setup.

Test registration, password reset, attachments, navigation and the rules links. Post a welcome thread describing where new members should begin. Share the [Member guide](../members/member-guide.md).

## 6. Confirm the operational handover

Ask the operator to demonstrate that scheduled work runs, an off-site backup exists and a restore has been tested. Record who handles hosting, account recovery and incidents.

Continue with [Community administration](organiser-guide.md) for day-to-day work and [Server operations](../operations/operating.md) for the hosting checklist.
