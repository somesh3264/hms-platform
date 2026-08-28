// Renders a hospital/biller display name colored to match its logo mark --
// blue for the name generally, with the literal word "Piles" picked out in
// the logo's own red -- a later, explicitly requested addition, kept
// consistent everywhere the name is shown as branding (nav header, login,
// printed bill, printed prescription form). Both colors were colorpicked
// directly from the uploaded logo file's dominant pixels, not approximated.
// Client-specific literal wording, not a generic markup convention -- the
// word "Piles" won't appear in another tenant's name, and this no-ops
// harmlessly (falls back to plain blue) when it's absent.
export function HospitalName({ name }: { name: string }) {
  const accentWord = 'Piles';
  const idx = name.indexOf(accentWord);
  if (idx === -1) {
    return <span className="hospital-name">{name}</span>;
  }
  return (
    <span className="hospital-name">
      {name.slice(0, idx)}
      <span className="hospital-name-accent">{accentWord}</span>
      {name.slice(idx + accentWord.length)}
    </span>
  );
}
