/**
 * `@meith/install` — the one-time installer's decisions (F83).
 *
 * Preflight, the step list, and the form schema. No Next, no SQL, and no direct
 * environment reads: the app gathers facts and performs writes, and this package
 * decides what the facts mean and what order the writes go in — which is what
 * makes "what does the installer say when the connection string is the direct
 * one" a unit test rather than an experiment against a real project.
 */

export {
  blockers,
  canProceed,
  looksLikePooler,
  preflight,
  warnings,
  type Check,
  type Level,
  type MailProbe,
  type PreflightProbe,
} from './preflight'

export {
  INSTALL_STEPS,
  firstFailure,
  freshReport,
  installed,
  type InstallStep,
  type StepOutcome,
  type StepStatus,
} from './plan'

export {
  MAIL_SKIP,
  defaultForumSlug,
  installInputSchema,
  mailConfigFromInstallInput,
  parseInstallInput,
  type InstallInput,
} from './form'
