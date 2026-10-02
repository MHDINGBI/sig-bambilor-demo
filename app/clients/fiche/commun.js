// Fiche client : état et petits rendus partagés entre les modules de fiche/.
import { ALERTES, estFrais, etat } from '../commun.js';
const { esc } = APP;

export const fcfa = SIG.fmtFCFA;
export const blobs = new Map();          // id de document → URL blob du PDF déjà téléchargé
export const profil = { initial: null }; // valeurs du profil à l'ouverture, pour détecter les modifications

export function getRoleActif() {
  if (etat.roleVue) return etat.roleVue;
  if (APP.aRole && APP.aRole('commercial')) return 'commercial';
  if (APP.aRole && APP.aRole('direction')) return 'direction';
  if (APP.aRole && (APP.aRole('technicien') || APP.aRole('conducteur'))) return 'technicien';
  return 'commercial';
}

export function libelleRole(r) {
  if (r === 'commercial') return 'Poste commercial';
  if (r === 'recouvrement') return 'Poste recouvrement';
  if (r === 'direction') return 'Direction générale';
  if (r === 'technicien') return 'Bureau technique';
  return 'Utilisateur';
}

export const tuile = (l, v, s) => `<div class="tuile"><span class="c-etiquette">${esc(l)}</span><span class="valeur">${v}</span>${s ? `<span class="aide">${esc(s)}</span>` : ''}</div>`;

export function alertes(docs) {
  const l = [...new Set(docs.flatMap((d) => d.alertes || []))];
  if (!l.length) return '';
  const liste = `<ul class="cl-alertes">${l.map((a) => `<li>${esc(ALERTES[a.split(':')[0]] || a)}${a.includes(':') ? ` <span class="aide">(${esc(a.split(':').slice(1).join(':'))})</span>` : ''}</li>`).join('')}</ul>`;
  // Au-delà de deux écarts, la liste est repliée : elle poussait le contrat hors de l'écran.
  return l.length <= 2 ? liste : `<details class="cl-alertes-repli"><summary>${l.length} écarts relevés dans les scans</summary>${liste}</details>`;
}

// ---------- RAPPROCHEMENT DES MONTANTS : bordereaux scannés contre fichier commercial ----------
// Le « total versé » du fichier commercial exclut les frais de dossier : la comparaison porte donc
// sur les bordereaux hors frais. Elle se fait **par lot** : un acquéreur peut détenir plusieurs
// lots, chacun avec son propre PDF, et comparer à la somme de ses lots ne comparerait rien.
// Mêmes règles que `actifs()` dans `etl/import_dossiers_ocr.py` (statut actif, lot du document).
export function rapprochementLot(versOcr, d) {
  if (!d.code_lot || !d.prix_vente) return null;
  const lus = (versOcr || [])
    .filter((v) => !estFrais(v) && v.document && v.document.code_lot === d.code_lot)
    .reduce((s, v) => s + (v.montant || 0), 0);
  const fichier = Number(d.total_verse || 0);
  if (!lus && !fichier) return null;
  const ecart = lus - fichier;
  return { lus, fichier, ecart, concorde: Math.abs(ecart) <= Math.max(1000, 0.01 * fichier) };
}

// Nom du PDF source (« Abdou SONKO F3 720 ») par id de document : titre de la visionneuse, dont la barre native
// n'affiche qu'un identifiant de blob. Alimenté par la fiche client et par la liste des scans non rattachés.
export const nomsDoc = new Map();
export const nomPdf = (chemin) => String(chemin || '').split('/').pop().replace(/\.pdf$/i, '');
export const retenirNoms = (docs) => (docs || []).forEach((d) => { if (d.chemin) nomsDoc.set(d.id, nomPdf(d.chemin)); });
