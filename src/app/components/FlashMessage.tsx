// Shared display side of src/shared/flash.ts's redirectWithFlash --
// renders whichever of the two a page's searchParams carries.
export function FlashMessage({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return <p className="alert alert-success">{success}</p>;
  }
  if (error) {
    return <p className="alert alert-error">{error}</p>;
  }
  return null;
}
