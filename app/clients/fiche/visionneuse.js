// Fiche client : visionneuse PDF des dossiers scannés (téléchargement, page, texte OCR).
import { PIECES } from '../commun.js';
import { blobs, nomsDoc } from './commun.js';
const { $ } = APP;

// ---------- Visionneuse PDF ----------
const DELAI_PDF_MS = 120000;
const telechargements = new Map();  // id → promesse en cours : un reclic ne relance pas le même téléchargement

// `progres(recu, total)` : total = 0 si le serveur n'annonce pas la taille.
export function pdfBlob(id, retente = false, progres = null) {
  if (blobs.has(id)) return Promise.resolve(blobs.get(id));
  if (telechargements.has(id)) return telechargements.get(id);
  const p = telecharger(id, retente, progres).finally(() => telechargements.delete(id));
  telechargements.set(id, p);
  return p;
}

async function telecharger(id, retente, progres) {
  const jeton = (() => { try { return localStorage.getItem('sig.access'); } catch (e) { return null; } })();
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), DELAI_PDF_MS);
  try {
    const r = await fetch(`/api/documents/${id}/pdf/`, { headers: jeton ? { Authorization: 'Bearer ' + jeton } : {}, signal: stop.signal });
    if (r.status === 401 && !retente) { await SIG.api('/api/me/'); return await telecharger(id, true, progres); }
    if (!r.ok) throw new Error(r.status === 404 ? 'fichier PDF indisponible sur ce serveur' : (r.statusText || 'erreur ' + r.status));
    const nomServeur = r.headers.get('X-Nom-Pdf');
    if (nomServeur) { try { nomsDoc.set(id, decodeURIComponent(nomServeur)); } catch (e) { /* nom illisible : titre neutre */ } }
    const total = Number(r.headers.get('Content-Length')) || 0;
    const morceaux = [];
    let recu = 0;
    const lecteur = r.body.getReader();
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value); recu += value.length;
      if (progres) progres(recu, total);
    }
    const url = URL.createObjectURL(new Blob(morceaux, { type: 'application/pdf' }));
    if (blobs.size > 4) { const [k, v] = blobs.entries().next().value; URL.revokeObjectURL(v); blobs.delete(k); }
    blobs.set(id, url);
    return url;
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('le serveur met trop de temps à répondre, réessayez') : e;
  } finally { clearTimeout(minuteur); }
}

let vDoc = null, vPage = 1, vAppel = 0;
export async function ouvrirPage(doc, page) {
  vDoc = doc; vPage = page;
  const dlg = $('cl-visionneuse');
  if (!dlg) return;
  const appel = ++vAppel;  // un clic plus récent annule l'affichage de celui-ci
  const nom = () => nomsDoc.get(doc);
  const titre = (suite) => `${nom() ? nom() + ' — ' : 'Dossier scanné — '}${suite}`;
  $('cl-v-titre').textContent = titre(`page ${page}`);
  $('cl-v-ocr').hidden = true; $('cl-v-texte').textContent = 'Texte OCR';
  // iframe neuve à chaque ouverture : réassigner src pendant qu'une navigation est en cours laisse le cadre blanc
  const ancien = $('cl-v-pdf');
  const cadre = ancien.cloneNode(false);
  cadre.hidden = false;
  ancien.replaceWith(cadre);
  if (!dlg.open) dlg.showModal();
  try {
    // R2 actif : le navigateur lit le PDF directement (par morceaux, la page demandée s'affiche sans attendre le reste)
    const direct = await SIG.api(`/api/documents/${doc}/pdf-url/`);
    if (appel !== vAppel) return;
    if (direct.url) {
      if (direct.nom) nomsDoc.set(doc, direct.nom);
      cadre.src = direct.url + '#page=' + page;
      $('cl-v-titre').textContent = titre(`page ${page}`);
      const lien = $('cl-v-telecharger');
      if (lien) { lien.href = direct.url; lien.removeAttribute('download'); }
      return;
    }
    const url = await pdfBlob(doc, false, (recu, total) => {
      if (appel !== vAppel) return;
      const mo = (recu / 1e6).toFixed(1);
      $('cl-v-titre').textContent = titre(`chargement… ${total ? Math.round(recu * 100 / total) + ' % (' + mo + ' / ' + (total / 1e6).toFixed(1) + ' Mo)' : mo + ' Mo'}`);
    });
    if (appel !== vAppel) return;
    cadre.src = url + '#page=' + page;
    $('cl-v-titre').textContent = titre(`page ${page}`);
    const btnTelecharger = $('cl-v-telecharger');
    if (btnTelecharger) {
      btnTelecharger.href = url;
      btnTelecharger.download = nom() ? `${nom().replace(/[\/:*?"<>|]+/g, '-')}.pdf` : `dossier-${doc}.pdf`;
    }
  } catch (e) {
    if (appel === vAppel) $('cl-v-titre').textContent = `Dossier scanné — ${e.message}`;
  }
}

export async function basculerTexte() {
  const pre = $('cl-v-ocr');
  if (!pre) return;
  if (!pre.hidden) { pre.hidden = true; $('cl-v-pdf').hidden = false; $('cl-v-texte').textContent = 'Texte OCR'; return; }
  pre.textContent = 'Chargement…'; pre.hidden = false; $('cl-v-pdf').hidden = true; $('cl-v-texte').textContent = 'Voir le scan';
  try {
    const p = await SIG.api(`/api/documents/${vDoc}/pages/${vPage}/`);
    const lecteur = p.source === 'vlm' ? 'PaddleOCR-VL' : 'Tesseract (lecture rapide)';
    pre.textContent = `[${PIECES[p.type_piece] || p.type_piece} · lu par ${lecteur}]\n\n${p.texte || '(page sans texte)'}`;
  } catch (e) { pre.textContent = 'Texte indisponible : ' + e.message; }
}
