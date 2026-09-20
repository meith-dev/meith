# Forms and server actions

## Server actions

Keep `"use server"` adapters in `apps/community/src/server/*-actions.ts` thin:

1. Parse and validate submitted data.
2. Resolve the actor and authorize the operation.
3. Call the domain service.
4. Convert expected errors into `FormState`.
5. Invalidate affected data and redirect outside the error-catching block.

Every action checks its own access. A guarded layout or hidden button is not authorisation. Preauthentication and signed-token flows use their own explicit checks.

Use the core validation, forbidden, not-found, conflict and rate-limit errors. Log unexpected failures without exposing their details to the member.

Never return credentials in `FormState`. The development password-reset exception requires its explicit environment gate and must remain unavailable in production.

## Native forms

Use a real `<form action={...}>`. Preserve submitted values after validation, except passwords and other secrets. Associate labels and errors with controls. Use the shared `FormError` focus behaviour.

`SubmitButton` and `PendingButton` use form status to prevent duplicate enhanced submissions. Server validation and idempotency still apply.

## JavaScript enhancement

Use `useActionState` and the existing progressive form helpers. `ProgressiveMarker` is set after enhancement mounts; `isEnhancedSubmit` selects the response path. Derive the authoritative result on the server before choosing state or redirect.

Do not replace native submission with an `onSubmit` transport or recompute permissions in the client. A scheme toggle may update its class immediately while saving the preference in the background.

## Theme integration

The app builds forms and passes them into theme regions. Models contain serialisable data; server actions and authorisation logic stay in the app.

For destructive confirmations and success feedback, use [UI conventions](ui-conventions.md).
