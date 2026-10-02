// Dossiers — Versements, annulation de reçu et désistement.
import { actions, aujourdhui, etat, messageDlg, msgFiche } from './commun.js';
import { afficherDetail, chargerDetail } from './fiche.js';
import { ouvrirDocument } from './documents.js';
const { $ } = APP;

// ---------- versement / annulation / désistement ----------
export async function ouvrirVersement(prefill, dossierId) {
  actions.construire();
  if (dossierId && (!etat.detail || etat.detail.id !== Number(dossierId))) {
    await chargerDetail(Number(dossierId));
  }
  if (!etat.detail) return;
  $('do-v-date').value = (prefill && prefill.date_versement) || aujourdhui();
  $('do-v-montant').value = (prefill && prefill.montant != null) ? prefill.montant : '';
  $('do-v-reference').value = (prefill && prefill.reference) || '';
  if (prefill && prefill.nature) $('do-v-nature').value = prefill.nature;
  if (prefill && prefill.mode) $('do-v-mode').value = prefill.mode;
  $('do-v-msg').className = '';
  $('do-v-msg').textContent = '';
  $('do-v-recu').hidden = true;
  $('do-v-valider').disabled = false;
  $('do-dlg-versement').showModal();
}

export async function validerVersement() {
  const btn = $('do-v-valider');
  const montant = Number($('do-v-montant').value);
  if (!(montant > 0)) { messageDlg('do-v-msg', 'Le montant doit être supérieur à zéro.', true); return; }
  btn.disabled = true;
  try {
    const body = {
      date_versement: $('do-v-date').value || aujourdhui(),
      montant,
      nature: $('do-v-nature').value,
      mode: $('do-v-mode').value,
      reference: $('do-v-reference').value.trim() || null,
      reference: $('do-v-reference').value.trim(),
    };
    const res = await SIG.api(`/api/dossiers/${etat.detail.id}/versements/`, { method: 'POST', body });
    messageDlg('do-v-msg', SIG.DEV ? 'Mode démonstration : versement simulé.'
      : `Versement enregistré · reçu ${res.numero_recu || ''}.`);
    if (!SIG.DEV && res.id) {
      const b = $('do-v-recu');
      b.hidden = false;
      b.onclick = () => ouvrirDocument('recu', res.id, 'Reçu');
      etat.detail = res.dossier || etat.detail;
      afficherDetail();
      if (etat.detail && etat.detail.id) {
        await chargerDetail(etat.detail.id);
      } else {
        etat.detail = res.dossier || etat.detail;
        afficherDetail();
      }
      if (APP.clients && APP.clients.courant) {
        APP.clients.ouvrirClient(APP.clients.courant);
      }
    }
  } catch (e) {
    messageDlg('do-v-msg', 'Erreur : ' + e.message, true);
    btn.disabled = false;
  }
}

export function ouvrirAnnulation(idVersement, numero) {
  $('do-a-motif').value = '';
  $('do-a-numero').textContent = numero || '';
  $('do-a-msg').className = '';
  $('do-a-msg').textContent = '';
  $('do-a-confirmer').hidden = true;
  $('do-a-valider').hidden = false;
  $('do-a-valider').disabled = false;
  $('do-dlg-annulation').dataset.versement = String(idVersement);
  $('do-dlg-annulation').showModal();
}

export function demanderAnnulation() {
  if (!$('do-a-motif').value.trim()) { messageDlg('do-a-msg', 'Le motif est obligatoire.', true); return; }
  messageDlg('do-a-msg', 'Le reçu restera visible, barré et marqué annulé. Confirmez-vous ?', true);
  $('do-a-valider').hidden = true;
  $('do-a-confirmer').hidden = false;
}

export async function validerAnnulation() {
  const id = Number($('do-dlg-annulation').dataset.versement);
  $('do-a-confirmer').disabled = true;
  try {
    const res = await SIG.api(`/api/versements/${id}/annulation/`, { method: 'POST', body: { motif: $('do-a-motif').value.trim() } });
    if (SIG.DEV) { messageDlg('do-a-msg', 'Mode démonstration : annulation simulée.'); $('do-a-confirmer').disabled = false; return; }
    $('do-dlg-annulation').close();
    etat.detail = res.dossier || etat.detail;
    if (res.dossier) afficherDetail(); else await chargerDetail(etat.detail.id);
  } catch (e) {
    messageDlg('do-a-msg', 'Erreur : ' + e.message, true);
    $('do-a-confirmer').disabled = false;
  }
}

export function ouvrirDesistement() {
  $('do-d-date').value = aujourdhui();
  $('do-d-montant').value = '';
  $('do-d-motif').value = '';
  $('do-d-msg').className = '';
  $('do-d-msg').textContent = '';
  $('do-d-confirmer').hidden = true;
  $('do-d-valider').hidden = false;
  $('do-d-valider').disabled = false;
  $('do-dlg-desistement').showModal();
}

export function demanderDesistement() {
  if (!$('do-d-motif').value.trim()) { messageDlg('do-d-msg', 'Le motif est obligatoire.', true); return; }
  messageDlg('do-d-msg', 'Le dossier sera clos et le lot redeviendra disponible. Confirmez-vous ?', true);
  $('do-d-valider').hidden = true;
  $('do-d-confirmer').hidden = false;
}

export async function validerDesistement() {
  $('do-d-confirmer').disabled = true;
  try {
    const body = {
      date: $('do-d-date').value || aujourdhui(),
      montant_rembourse: Number($('do-d-montant').value) || 0,
      motif: $('do-d-motif').value.trim(),
    };
    const res = await SIG.api(`/api/dossiers/${etat.detail.id}/desistement/`, { method: 'POST', body });
    if (SIG.DEV) { messageDlg('do-d-msg', 'Mode démonstration : désistement simulé.'); $('do-d-confirmer').disabled = false; return; }
    $('do-dlg-desistement').close();
    // Un désistement ouvre le remboursement : la fiche créée avec le désistement, où l'on remplit la demande.
    if (res && res.remboursement_id) {
      APP.ui.toast('Désistement enregistré, lot libéré. Complétez la demande de remboursement.');
      location.hash = '#contentieux/remb=' + res.remboursement_id;
      return;
    }
    await chargerDetail(etat.detail.id);
  } catch (e) {
    messageDlg('do-d-msg', 'Erreur : ' + e.message, true);
    $('do-d-confirmer').disabled = false;
  }
}
