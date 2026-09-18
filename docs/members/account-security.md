# Manage your account security

Manage your own sign-in methods and devices at `/usercp/security`. Options depend on the features your community enables. Keep access to your account email address and save recovery codes somewhere separate from your authenticator device.

## Reset a forgotten password

Use the password-reset link on the sign-in page. Enter your email address, check the inbox and spam folder, and follow the link if it arrives. The form does not reveal whether an address belongs to an account.

If no message arrives, contact the community's organisers. They can check delivery with the operator. Repeated requests do not solve a mail configuration problem.

## Set up two-factor authentication

Open the security page and follow the authenticator setup. Confirm the code before leaving the page, then save the recovery codes securely. At future sign-ins, enter an authenticator code or an unused recovery code when prompted.

If you lose the authenticator, use a recovery code. If you lose both, contact the organisers; an operator must establish your identity before clearing the second factor. Clearing it signs your sessions out, and you must enroll again.

## Use a passkey or sign-in provider

If the board offers passkeys, register one from the security page and follow your browser or device prompt. Keep another working sign-in method while testing a new one.

If the board offers an external provider, use the supported link/unlink controls. Signing in at a provider is not a way to take over an existing board account with the same email address. Follow any verification or linking prompt shown by the board.

## Review sessions and security activity

Review the devices or sessions listed on the security page and revoke ones you no longer use. Check recent security events if you see unexpected activity. Changing your password signs out other sessions.

The admin panel has its own session and may ask for your password again even when you are already signed in to the board.

Operators configuring these features should use [Authentication settings](../operations/single-sign-on.md).
