import { redirect } from 'next/navigation';

// Generalizes the ?error=1 pattern src/app/login used first: every
// same-page mutating Server Action redirects back to the page it came from
// with a human-readable flash message, instead of revalidating in place
// (success) or throwing into Next's default error page (failure) -- see
// src/app/components/FlashMessage.tsx for the display side.
//
// `sid` is a reset-key nonce, not shown to the user: pages key their
// "create new" forms on it (e.g. `key={searchParams.sid ?? 'idle'}`) so a
// genuine success forces React to remount and clear the form, while an
// error redirect (which never sets `sid`) leaves the key stable so
// whatever the user typed survives for them to fix and resubmit. A key
// derived from the message text alone wouldn't work -- two consecutive
// successful submissions would carry the same text and the key wouldn't
// change the second time.
export function redirectWithFlash(path: string, flash: { success?: string; error?: string }): never {
  // `path` may already carry its own query string (e.g. front-desk's
  // createVisitAction preserving ?q=... across the redirect) -- merge
  // rather than append, so it doesn't produce a second "?".
  const [pathname, existingQuery] = path.split('?');
  const params = new URLSearchParams(existingQuery);
  if (flash.success) {
    params.set('success', flash.success);
    params.set('sid', Date.now().toString());
  }
  if (flash.error) {
    params.set('error', flash.error);
  }
  redirect(`${pathname}?${params.toString()}`);
}
