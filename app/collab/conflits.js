// Conflits d'écriture collab v2 (spec § 8) : champs modifiés, origine envoyée, choix du dialogue, boucle d'enregistrement.
// Pur (aucun import, aucun DOM) : testable sous node. Le dialogue et le toast sont injectés (APP.ui par défaut, lus à l'appel).
const TECHNIQUES = ['modifie_le', 'collab_origine'];

// Même règle que backend/sig/collab/versions.py (egales) : '' ≡ null ; nombres comparés numériquement seulement si l'un
// des deux côtés est un nombre (deux chaînes « 0770 » / « 770 » restent différentes : téléphones).
export function valeursEgales(a, b) {
  const vide = (v) => v === null || v === undefined || v === '';
  if (vide(a) || vide(b)) return vide(a) && vide(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a), nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) ? na === nb : String(a) === String(b);
  }
  return String(a) === String(b);
}

export const champsModifies = (actuel, initial) => Object.keys(actuel).filter((k) => !valeursEgales(actuel[k], initial[k]));
export const choisir = (objet, cles) => Object.fromEntries(cles.filter((k) => k in objet).map((k) => [k, objet[k]]));
export const resteAEcrire = (corps) => Object.keys(corps).some((k) => !TECHNIQUES.includes(k));

export function avecOrigine(corps, origine) {
  const o = {};
  for (const k of Object.keys(corps)) if (!TECHNIQUES.includes(k) && k in origine) o[k] = origine[k];
  return { ...corps, collab_origine: o };
}

export function texteValeur(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'Oui';
  if (v === false) return 'Non';
  return String(v);
}

export function appliquerChoix({ corps, origine, detail, choix }) {
  const c = { ...corps }, o = { ...origine };
  for (const ch of (detail && detail.champs) || []) {
    if (choix[ch.nom] === 'sienne') { delete c[ch.nom]; delete o[ch.nom]; } else o[ch.nom] = ch.sienne;
  }
  return { corps: c, origine: o };
}

const estConflit = (e) => e && e.status === 409 && e.data && e.data.code === 'conflit_version';

export async function enregistrerAvecConflits({ envoyer, corps, origine = {}, mode = 'champs',
  conflit = (d) => window.APP.ui.conflit(d), toast = (m, o) => window.APP.ui.toast(m, o), maxEssais = 3 }) {
  let c = { ...corps }, o = { ...origine };
  for (let essai = 1; ; essai++) {
    try {
      const reponse = await envoyer(mode === 'champs' ? avecOrigine(c, o) : c);
      const f = reponse && reponse.collab_fusion;
      if (f) toast(`Enregistré — fusionné avec les modifications de ${f.par_nom || f.par || 'un collègue'}.`, { type: 'succes' });
      return { statut: 'enregistre', reponse };
    } catch (e) {
      if (!estConflit(e) || essai >= maxEssais) throw e;
      const choix = await conflit(e.data);
      if (!choix) return { statut: 'annule' };
      const champs = e.data.champs || [];
      if (mode === 'version') {
        if (champs.length && champs.every((ch) => choix[ch.nom] === 'sienne')) return { statut: 'sienne' };
        c = { ...c, modifie_le: e.data.version };
      } else {
        ({ corps: c, origine: o } = appliquerChoix({ corps: c, origine: o, detail: e.data, choix }));
        if (!resteAEcrire(c)) return { statut: 'sienne' };
      }
    }
  }
}
