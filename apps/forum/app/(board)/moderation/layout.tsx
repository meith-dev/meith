import { ModCpShell } from "@/components/moderation/modcp-shell";

/**
 * The ModCP's rail over the half of the panel that lives under `/moderation`.
 *
 * The approval queue, the reports list and the warn screen are moderator
 * screens in every sense except the route tree they happen to sit in, and they
 * are where a moderator spends the day. Until this file existed the panel's
 * navigation was rendered by `/modcp`'s layout alone, so it was present on the
 * screens a moderator *checks* and absent on the screens they *work* — clear
 * the queue and there was no way back to reports except the board's account
 * menu.
 *
 * The gate is the shell's, and each page under here still runs its own: these
 * three each answer `notFound()` for their own reasons — no queue in fixture
 * mode, no report scope, no `?user=` on the warn screen — and none of them may
 * lean on a layout for it.
 */
export default function ModerationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModCpShell>{children}</ModCpShell>;
}
