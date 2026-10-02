// Fiche client : rattachement d'un dossier scanné non rattaché à ce client.
import { etat, norm } from '../commun.js';
import { appliquerFiltres, majKPIsGlobaux } from '../liste.js';
import { retenirNoms } from './commun.js';
import { courant, ouvrirClient } from './ouverture.js';
const { $, esc, num } = APP;

// Scans que l'extraction n'a rattachés à personne — hors contentieux, qui a sa propre file dans la
// page Contentieux & Remboursements. C'est le seul moyen de donner un dossier scanné à un client qui
// n'en a pas quand l'extraction ne l'a pas fait toute seule.
export async function panneauRattachement(ref, requete) {
  const zone = $('cl-rattacher-scan');
  if (!zone) return;
  zone.hidden = false;
  if (!etat.donnees) {
    zone.innerHTML = '<p class="aide">Chargement des scans à rattacher…</p>';
    try { etat.donnees = await SIG.api('/api/clients/'); } catch (e) { zone.innerHTML = `<p class="note erreur">${esc(e.message)}</p>`; return; }
  }
  const q = norm(requete || '');
  const tous = (etat.donnees.documents_non_rattaches || []).filter((d) => d.categorie !== 'contentieux');
  retenirNoms(tous);
  const liste = tous.filter((d) => !q || norm(d.chemin + ' ' + (d.code_lot || '')).includes(q));
  const nom = (d) => d.chemin.split('/').pop().replace(/\.pdf$/i, '');
  zone.innerHTML = `
    <div class="cl-rattacher-tete">
      <input type="search" id="cl-rattacher-q" placeholder="Filtrer par nom de fichier ou lot…" value="${esc(requete || '')}" autocomplete="off"
             aria-label="Filtrer les dossiers scannés non rattachés">
      <span class="aide">${liste.length === tous.length ? APP.pl(tous.length, 'scan non rattaché', 'scans non rattachés') : `${num(liste.length)} sur ${num(tous.length)}`}</span>
      <button type="button" class="bouton secondaire micro" data-action="fermer-rattacher-scan">Fermer</button>
    </div>
    ${liste.length ? `<ul class="cl-rattacher-liste">${liste.slice(0, 30).map((d) => `
      <li>
        <span class="cl-rattacher-nom">${esc(nom(d))}</span>
        <span class="aide">${APP.pl(d.nb_pages || 0, 'page', 'pages')}${d.code_lot ? ` · lot ${esc(d.code_lot)}` : ''}</span>
        <button type="button" class="lien" data-doc="${d.id}" data-page="1">Voir le PDF</button>
        <button type="button" class="bouton micro" data-rattacher-scan="${d.id}" data-ref="${esc(ref)}">Rattacher à ce client</button>
      </li>`).join('')}</ul>
      ${liste.length > 30 ? `<p class="aide">${num(liste.length - 30)} autres : affinez le filtre.</p>` : ''}`
  : '<p class="aide">Aucun scan non rattaché ne correspond. Les dossiers scannés sont associés aux clients par l’extraction OCR.</p>'}`;
  const champ = $('cl-rattacher-q');
  if (champ && requete) { champ.focus(); champ.setSelectionRange(champ.value.length, champ.value.length); }
}

export async function rattacherScan(documentId, ref, bouton) {
  bouton.disabled = true;
  try {
    await SIG.api(`/api/contentieux/documents/${documentId}/rattachement/`, { method: 'POST', body: { acquereur_ref: ref } });
    // La liste de la page est rechargée : le scan n'est plus « non rattaché » et le client a un dossier de plus.
    etat.donnees = await SIG.api('/api/clients/');
    majKPIsGlobaux();
    appliquerFiltres();
    if (courant === ref) ouvrirClient(ref);
  } catch (e) { bouton.disabled = false; APP.ui.toast('Rattachement refusé : ' + e.message, { type: 'erreur' }); }
}
