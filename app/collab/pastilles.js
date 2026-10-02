// Pastilles 💬 des listes (spec § 5) : une requête par liste, seulement les fiches qui ont des messages non lus.
const esc = (s) => (window.APP?.esc ? window.APP.esc(s) : String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])));

export async function nonLusListe(cibleType) {
  if (window.SIG && window.SIG.DEV) return {};
  try {
    const r = await window.SIG.api(`/api/collab/non-lus/?cible_type=${encodeURIComponent(cibleType)}`);
    return r.non_lus || {};
  } catch (e) {
    return {};
  }
}

export function pastilleHTML(n) {
  if (!n) return '';
  const val = Number(n);
  if (!val || val <= 0) return '';
  const t = val > 1 ? `${val} messages non lus` : '1 message non lu';
  const label = val > 99 ? '99+' : String(val);
  return `<span class="collab-pastille" title="${esc(t)}" aria-label="${esc(t)}">💬 ${esc(label)}</span>`;
}
