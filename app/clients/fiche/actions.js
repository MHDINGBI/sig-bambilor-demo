// Fiche client : actions — export Excel, historique, enregistrement du profil, rapprochement OCR, nouveau client.
import { charger } from '../liste.js';
import { champsModifies, choisir, enregistrerAvecConflits } from '../../collab/conflits.js';
import { profil } from './commun.js';
import { valeursProfil } from './profil.js';
import { ouvrirClient } from './ouverture.js';
const { $, esc } = APP;

// ---------- INTEROPÉRABILITÉ EXCEL ----------
// Le classeur produit reprend la structure du classeur commercial du pôle commercial : il est
// **réimportable** (etl/import_commercial.py). Le téléchargement passe par `SIG.api(..., { brut: true })`
// pour porter le jeton d'authentification : un simple lien répondrait 401 hors mode sans identification.
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
    const msg = $('cl-p-msg');
    if (msg) { msg.textContent = 'Classeur exporté — il est réimportable tel quel.'; msg.className = 'msg succes'; }
  } catch (e) {
    const msg = $('cl-p-msg');
    if (msg) { msg.textContent = 'Export Excel indisponible : ' + e.message; msg.className = 'msg erreur'; }
  }
}

// ---------- Historique collaboratif d'équipe ----------
export async function chargerJournalClient(ref) {
  const el = $('cl-journal-contenu');
  if (!el) return;
  el.innerHTML = '<p class="vide">Chargement de l’historique d’activité…</p>';
  try {
    const res = await SIG.api('/api/journal/?client=' + encodeURIComponent(ref));
    el.innerHTML = APP.journalHTML(res.journal);
  } catch (e) {
    el.innerHTML = `<p class="note erreur">Historique indisponible : ${esc(e.message)}</p>`;
  }
}

// ---------- ENREGISTREMENT DU PROFIL & COORDONNÉES CLIENT ----------
// L'écriture passe par /api/acquereurs/<id>/ : /api/clients/<ref>/ n'expose que la lecture (le PATCH y
// répondait 405 et la fiche ne s'enregistrait jamais).
export async function enregistrerProfil(ref, acquereurId) {
  const msgEl = $('cl-p-msg');
  const btn = $('cl-p-enregistrer');
  const actuel = valeursProfil();

  if (!actuel.nom) {
    if (msgEl) {
      msgEl.className = 'msg erreur';
      msgEl.textContent = 'Le nom de l’acquéreur est obligatoire.';
    }
    return;
  }

  if (!acquereurId) {
    if (msgEl) {
      msgEl.className = 'msg erreur';
      msgEl.textContent = 'Aucune fiche acquéreur n’est rattachée à ce client : enregistrement impossible.';
    }
    return;
  }

  const cles = profil.initial?.ref === ref ? champsModifies(actuel, profil.initial.valeurs) : Object.keys(actuel);
  if (!cles.length) {
    if (msgEl) {
      msgEl.className = 'msg';
      msgEl.textContent = 'Aucune modification à enregistrer.';
    }
    return;
  }

  if (btn) btn.disabled = true;
  if (msgEl) {
    msgEl.className = 'msg';
    msgEl.textContent = 'Enregistrement des modifications…';
  }

  try {
    const r = await enregistrerAvecConflits({
      envoyer: (corps) => SIG.api('/api/acquereurs/' + encodeURIComponent(acquereurId) + '/', { method: 'PATCH', body: corps }),
      corps: choisir(actuel, cles),
      origine: profil.initial?.ref === ref ? choisir(profil.initial.origine, cles) : {},
    });

    if (r.statut === 'annule') {
      if (msgEl) {
        msgEl.className = 'msg';
        msgEl.textContent = 'Enregistrement annulé : vos saisies sont conservées.';
      }
      if (btn) btn.disabled = false;
      return;
    }

    if (r.statut === 'sienne') {
      if (msgEl) {
        msgEl.className = 'msg';
        msgEl.textContent = 'Version de votre collègue conservée : rien n’a été enregistré.';
      }
      ouvrirClient(ref, { garderDefilement: true });
      return;
    }

    if (msgEl) {
      msgEl.className = 'msg succes';
      msgEl.textContent = 'Coordonnées enregistrées avec succès.';
    }
    document.dispatchEvent(new Event('collab:enregistre'));
    // Recharger la liste en tâche de fond et rafraîchir la fiche
    charger().catch(() => {});
    setTimeout(() => {
      ouvrirClient(ref, { garderDefilement: true });
    }, 700);
  } catch (e) {
    if (msgEl) {
      msgEl.className = 'msg erreur';
      msgEl.textContent = 'Erreur : ' + e.message;
    }
    if (btn) btn.disabled = false;
  }
}

// ---------- RAPPROCHEMENT 1-CLIC AVEC LES SCANS OCR ----------
export async function rapprocherProfil(ref) {
  const btns = document.querySelectorAll(`[data-action="rapprocher-ocr"][data-ref="${ref}"]`);
  btns.forEach((b) => (b.disabled = true));
  const msgEl = $('cl-p-msg');
  if (msgEl) {
    msgEl.className = 'msg';
    msgEl.textContent = 'Synchronisation automatique avec les scans en cours…';
  }

  try {
    const res = await SIG.api('/api/clients/' + encodeURIComponent(ref) + '/rapprocher/', { method: 'POST' });
    charger().catch(() => {});
    await ouvrirClient(ref);
    const msgNouveau = $('cl-p-msg');
    if (msgNouveau) {
      msgNouveau.className = 'msg succes';
      msgNouveau.textContent = res.message || 'Données synchronisées avec succès depuis les scans OCR !';
    }
  } catch (e) {
    if (msgEl) {
      msgEl.className = 'msg erreur';
      msgEl.textContent = 'Erreur de synchronisation : ' + e.message;
    }
    btns.forEach((b) => (b.disabled = false));
  }
}

// ---------- MODALE NOUVEAU CLIENT / ACQUÉREUR ----------
export function ouvrirNouveauClient() {
  const dlg = $('cl-dlg-nouveau-client');
  if (!dlg) return;
  if ($('cl-nc-nom')) $('cl-nc-nom').value = '';
  if ($('cl-nc-prenoms')) $('cl-nc-prenoms').value = '';
  if ($('cl-nc-telephone')) $('cl-nc-telephone').value = '';
  if ($('cl-nc-email')) $('cl-nc-email').value = '';
  if ($('cl-nc-piece-num')) $('cl-nc-piece-num').value = '';
  if ($('cl-nc-adresse')) $('cl-nc-adresse').value = '';
  if ($('cl-nc-profession')) $('cl-nc-profession').value = '';
  const msg = $('cl-nc-msg');
  if (msg) {
    msg.hidden = true;
    msg.textContent = '';
    msg.className = 'msg';
  }
  const validerBtn = $('cl-nc-valider');
  if (validerBtn) validerBtn.disabled = false;
  dlg.showModal();
  $('cl-nc-nom')?.focus();
}

export async function validerNouveauClient() {
  const nom = ($('cl-nc-nom')?.value || '').trim();
  const prenoms = ($('cl-nc-prenoms')?.value || '').trim();
  // Civilité inconnue : envoyer null plutôt que d'inventer « M. » en base (E-47)
  const civilite = $('cl-nc-civilite')?.value || null;
  const telephone = ($('cl-nc-telephone')?.value || '').trim();
  const email = ($('cl-nc-email')?.value || '').trim();
  const pieceType = $('cl-nc-piece-type')?.value || 'CNI';
  const pieceNum = ($('cl-nc-piece-num')?.value || '').trim();
  const adresse = ($('cl-nc-adresse')?.value || '').trim();
  const profession = ($('cl-nc-profession')?.value || '').trim();

  const msg = $('cl-nc-msg');
  const validerBtn = $('cl-nc-valider');

  if (!nom) {
    if (msg) {
      msg.hidden = false;
      msg.className = 'msg erreur';
      msg.textContent = 'Le nom de famille est obligatoire.';
    }
    return;
  }

  if (validerBtn) validerBtn.disabled = true;
  if (msg) {
    msg.hidden = false;
    msg.className = 'msg';
    msg.textContent = 'Création de la fiche acquéreur…';
  }

  try {
    const res = await SIG.api('/api/acquereurs/', {
      method: 'POST',
      body: {
        civilite,
        nom,
        prenoms: prenoms || null,
        telephone: telephone || null,
        email: email || null,
        piece_type: pieceType,
        piece_numero: pieceNum || null,
        adresse: adresse || null,
        profession: profession || null,
      },
    });

    $('cl-dlg-nouveau-client')?.close();
    await charger();
    if (res && res.acquereur_ref) {
      ouvrirClient(res.acquereur_ref);
    }
  } catch (e) {
    if (msg) {
      msg.hidden = false;
      msg.className = 'msg erreur';
      msg.textContent = 'Erreur : ' + e.message;
    }
    if (validerBtn) validerBtn.disabled = false;
  }
}
