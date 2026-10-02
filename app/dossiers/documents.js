// Dossiers — Documents générés (HTML), export Excel et dépôt de pièces.
import { chargerDetail } from './fiche.js';
import { etat, msgFiche } from './commun.js';

// ---------- documents générés ----------
export async function ouvrirDocument(type, id, titre) {
  if (SIG.DEV) {
    msgFiche(`Document « ${titre} » : disponible avec l’API (aucune route en mode démonstration).`, true);
    return;
  }
  const w = window.open('', '_blank'); // ouverte pendant le clic : sinon bloquée comme fenêtre surgissante
  if (!w) { msgFiche('Autorisez les fenêtres surgissantes pour afficher le document.', true); return; }
  w.document.body.textContent = 'Préparation du document…';
  try {
    const res = await SIG.api(`/api/documents-generes/${type}/${id}/`, { brut: true });
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }));
    w.location.href = url;
  } catch (e) {
    w.document.body.textContent = 'Document indisponible : ' + e.message;
  }
}

// ---------- INTEROPÉRABILITÉ EXCEL ----------
// Le classeur produit reprend la structure du classeur commercial du pôle commercial, et reste
// **réimportable** (etl/import_commercial.py). `SIG.api(..., { brut: true })` pour porter le jeton.
// Volontairement local et non dans shared/api.js, qui est figé.
export async function telechargerFichierCommercial(ref) {
  try {
    const requete = ref ? '?ref=' + encodeURIComponent(ref) : '';
    const reponse = await SIG.api('/api/export/fichier-commercial.xlsx' + requete, { brut: true });
    const url = URL.createObjectURL(await reponse.blob());
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = ref ? `fichier-commercial-${ref}.xlsx` : 'fichier-commercial.xlsx';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    URL.revokeObjectURL(url);
    msgFiche('Classeur exporté — il est réimportable tel quel.');
  } catch (e) {
    msgFiche('Export Excel indisponible : ' + e.message, true);
  }
}

export async function envoyerPiece(e) {
  const fichier = e.target.files[0];
  if (!fichier) return;
  try {
    const fd = new FormData();
    fd.append('objet', 'dossier');
    fd.append('objet_id', String(etat.detail.id));
    fd.append('categorie', 'dossier');
    fd.append('fichier', fichier);
    await SIG.api('/api/pieces/', { method: 'POST', body: fd });
    if (SIG.DEV) { msgFiche('Mode démonstration : pièce simulée, rien n’a été envoyé.'); return; }
    await chargerDetail(etat.detail.id);
  } catch (err) {
    msgFiche('Envoi impossible : ' + err.message, true);
  }
}

