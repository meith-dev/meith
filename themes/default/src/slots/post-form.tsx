import type { PostFormModel } from "@forum/theme-kit";

/**
 * The composer page frame (F39).
 *
 * The theme owns the page; the app owns the `<form>` in `regions.form`, because
 * that element carries a Server Action reference and those never cross the
 * theme contract (D38/D42). Everything visible here — heading, cancel, where
 * the toolbar island sits — is still the theme's to change.
 */
export function PostForm({
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
}: PostFormModel) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold">{heading}</h1>
        <a href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">
          {cancelLabel}
        </a>
      </div>

      {/*
        The route's own error — "this forum is closed", say. Errors raised by a
        submit come back through the form itself, which is why both exist.
      */}
      {errorMessage !== null && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-5">
        {regions.toolbar}
        {regions.form}
      </div>
    </div>
  );
}
