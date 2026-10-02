// Dossiers — Réaffectation de lot, part du prix, rattachement/détachement et déplacement de scans.
import { actions, dateFr, etat, fcfa, messageDlg, msgFiche } from './commun.js';
import { chargerDetail } from './fiche.js';
const { $, esc, num, pl } = APP;

let dernierLotVerifie = null;
let partDefaut = null;
let scanADeplacer = null, cibleScan = null;

export async function ouvrirReaffectation(codeLotPrefill, dossierId) {
  actions.construire();
  if (dossierId && (!etat.detail || etat.detail.id !== Number(dossierId))) {
    await chargerDetail(Number(dossierId));
  }
  if (!etat.detail) return;
  $('do-r-lot').value = codeLotPrefill || '';
  $('do-r-motif').value = '';
  $('do-r-forcer').checked = false;
  $('do-r-forcer-label').hidden = true;
  $('do-r-maj-type').checked = true;
  $('do-r-maj-type-label').hidden = true;
  $('do-r-feedback').innerHTML = '';
  $('do-r-msg').className = '';
  $('do-r-msg').textContent = '';
  $('do-r-valider').disabled = true;
  $('do-dlg-reaffectation').showModal();
  if (codeLotPrefill) {
    verifierLot(codeLotPrefill);
  }
}

export async function verifierLot(lot) {
  const code = (lot || '').trim();
  if (!code) {
    $('do-r-feedback').innerHTML = '';
    $('do-r-valider').disabled = true;
    $('do-r-forcer-label').hidden = true;
    $('do-r-maj-type-label').hidden = true;
    dernierLotVerifie = null;
    return;
  }
  dernierLotVerifie = code;
  $('do-r-feedback').innerHTML = '<p class="aide">Vérification de cohérence instantanée en cours…</p>';
  try {
    const res = await SIG.api(`/api/dossiers/${etat.detail.id}/verifier-lot/`, {
      method: 'POST',
      body: { code_lot: code }
    });
    if (dernierLotVerifie !== code) return;

    let html = '';
    const c = res.conflit;
    const l = res.details_lot;
    if (c) {
      html += `<div class="do-r-carte alerte">
        <h4>⚠️ Conflit d’attribution</h4>
        <p>Le lot <strong>${esc(res.code_lot)}</strong> est déjà engagé sur le dossier actif <strong>#${esc(c.id || c.dossier_id)}</strong> (${esc(c.acquereur_nom || 'Client sans nom')}).</p>
        <p class="aide">Statut dossier : ${esc(c.statut_dossier || c.statut || 'actif')}${c.date_reservation ? ' · Réservé le ' + dateFr(c.date_reservation) : ''}</p>
      </div>`;
      $('do-r-forcer-label').hidden = false;
    } else if (!res.existe_plan) {
      html += `<div class="do-r-carte vigilance">
        <h4>ℹ️ Lot non trouvé sur le plan cadastral (DXF)</h4>
        <p>Le lot <strong>${esc(res.code_lot)}</strong> n’est pas modélisé au cadastre importé. L’affectation est possible pour régulariser le dossier, mais il ne figurera pas sur la carte.</p>
      </div>`;
      $('do-r-forcer-label').hidden = true;
    } else if (!res.disponible) {
      html += `<div class="do-r-carte alerte">
        <h4>⚠️ Lot non disponible</h4>
        <p>Le lot <strong>${esc(res.code_lot)}</strong> a le statut « ${esc(res.bloque ? 'bloqué' : (l && l.statut_commercial) || 'indisponible')} ».</p>
      </div>`;
      $('do-r-forcer-label').hidden = false;
    } else {
      html += `<div class="do-r-carte succes">
        <h4>✓ Lot disponible</h4>
        <p>Phase : ${esc((l && (l.nom_phase || l.code_phase)) || '—')} · Typologie : <strong>${esc((l && l.type_villa) || '—')}</strong>${(l && l.surface_m2) ? ` · Surface : ${num(l.surface_m2)} m²` : ''}</p>
      </div>`;
      $('do-r-forcer-label').hidden = true;
    }

    if (res.avertissements && res.avertissements.length) {
      html += `<ul class="aide" style="margin-top:6px; list-style:disc; padding-left:18px;">
        ${res.avertissements.map((a) => `<li>${esc(a)}</li>`).join('')}
      </ul>`;
    }

    const lotType = l && l.type_villa;
    if (res.existe_plan && lotType && etat.detail.type_villa && lotType !== etat.detail.type_villa) {
      $('do-r-maj-type-label').hidden = false;
      $('do-r-type-nom').textContent = lotType;
    } else {
      $('do-r-maj-type-label').hidden = true;
    }

    $('do-r-feedback').innerHTML = html;
    $('do-dlg-reaffectation').dataset.valide = res.valide ? '1' : '0';
    $('do-dlg-reaffectation').dataset.conflit = res.conflit ? '1' : '0';
    $('do-dlg-reaffectation').dataset.existePlan = res.existe_plan ? '1' : '0';
    actualiserBoutonValider();
  } catch (e) {
    if (dernierLotVerifie !== code) return;
    $('do-r-feedback').innerHTML = `<div class="do-r-carte alerte"><h4>Erreur de vérification</h4><p>${esc(e.message)}</p></div>`;
    $('do-r-valider').disabled = true;
  }
}

export function actualiserBoutonValider() {
  const lotSaisi = ($('do-r-lot')?.value || '').trim();
  const motifSaisi = ($('do-r-motif')?.value || '').trim();
  const dlg = $('do-dlg-reaffectation');
  if (!dlg || !lotSaisi || !motifSaisi) {
    if ($('do-r-valider')) $('do-r-valider').disabled = true;
    return;
  }
  const valide = dlg.dataset.valide === '1';
  const conflit = dlg.dataset.conflit === '1';
  const forcer = $('do-r-forcer')?.checked;
  const existePlan = dlg.dataset.existePlan === '1';

  if (valide || (conflit && forcer) || (!existePlan && !conflit)) {
    $('do-r-valider').disabled = false;
  } else {
    $('do-r-valider').disabled = true;
  }
}

export async function validerReaffectation() {
  const lot = ($('do-r-lot').value || '').trim();
  const motif = ($('do-r-motif').value || '').trim();
  const forcer = $('do-r-forcer').checked;
  const majType = $('do-r-maj-type').checked;

  if (!lot) { messageDlg('do-r-msg', 'Le code lot est obligatoire.', true); return; }
  if (!motif) { messageDlg('do-r-msg', 'Le motif est obligatoire pour la traçabilité.', true); return; }

  $('do-r-valider').disabled = true;
  messageDlg('do-r-msg', 'Enregistrement de la réaffectation…');

  try {
    const res = await SIG.api(`/api/dossiers/${etat.detail.id}/reaffecter-lot/`, {
      method: 'POST',
      body: {
        code_lot: lot,
        motif: motif,
        forcer: forcer,
        maj_type_villa: majType
      }
    });
    $('do-dlg-reaffectation').close();
    msgFiche(`Lot mis à jour : ${res.code_lot || 'aucun'}.`, false);
    await chargerDetail(etat.detail.id);
    if (APP.clients && APP.clients.courant) {
      APP.clients.ouvrirClient(APP.clients.courant);
    }
  } catch (e) {
    messageDlg('do-r-msg', 'Erreur : ' + e.message, true);
    $('do-r-valider').disabled = false;
  }
}

export function ouvrirPart(dossierId) {
  const x = (etat.detail.ventilation || {}).lots.find((l) => l.id === dossierId);
  if (!x) return;
  $('do-p-titre').textContent = `Part du prix du lot ${x.code_lot}`;
  $('do-p-part').value = x.part_prix;
  $('do-p-part').dataset.dossier = dossierId;
  $('do-p-msg').className = ''; $('do-p-msg').textContent = '';
  $('do-dlg-part').showModal();
}

export async function validerPart() {
  const id = Number($('do-p-part').dataset.dossier);
  $('do-p-valider').disabled = true;
  try {
    await SIG.api(`/api/dossiers/${id}/`, { method: 'PATCH', body: { part_prix: Number($('do-p-part').value) } });
    $('do-dlg-part').close();
    await chargerDetail(etat.detail.id);
    msgFiche('Part du prix mise à jour : le versé de chaque villa est recalculé.', false);
    if (APP.clients && APP.clients.courant) APP.clients.ouvrirClient(APP.clients.courant);
  } catch (e) {
    messageDlg('do-p-msg', 'Erreur : ' + e.message, true);
  }
  $('do-p-valider').disabled = false;
}

// ---------- lot rattaché : un acquéreur, deux villas, un seul règlement ----------
// dossierId : appel depuis la fiche client, où la fiche du dossier n'est pas encore chargée
export async function ouvrirRattachement(dossierId) {
  actions.construire();
  if (dossierId && (!etat.detail || etat.detail.id !== Number(dossierId))) await chargerDetail(Number(dossierId));
  if (!etat.detail) return;
  const nb = (etat.detail.lots_rattaches || []).length + 2;   // le principal, les lots déjà rattachés et le nouveau
  partDefaut = etat.detail.prix_vente ? Math.round(etat.detail.prix_vente / nb) : null;
  $('do-t-part').value = partDefaut != null ? partDefaut : '';
  $('do-t-part-aide').textContent = partDefaut != null
    ? `Répartition égale proposée : ${fcfa(etat.detail.prix_vente)} pour ${nb} villas. Le lot principal garde le reste.` : 'Le dossier n’a pas de prix : rien à ventiler.';
  $('do-t-lot').value = '';
  $('do-t-motif').value = '';
  $('do-t-feedback').innerHTML = '';
  $('do-t-msg').className = '';
  $('do-t-msg').textContent = '';
  $('do-t-valider').disabled = true;
  $('do-dlg-rattachement').showModal();
}

export async function verifierLotRattache(lot) {
  const code = (lot || '').trim();
  $('do-t-valider').disabled = true;
  if (!code) { $('do-t-feedback').innerHTML = ''; return; }
  try {
    const res = await SIG.api(`/api/dossiers/${etat.detail.id}/verifier-lot/`, { method: 'POST', body: { code_lot: code } });
    if (($('do-t-lot').value || '').trim() !== code) return;
    const l = res.details_lot;
    let carte;
    if (code === etat.detail.code_lot) carte = ['alerte', 'C’est déjà le lot de ce dossier', 'Saisissez l’autre villa.'];
    else if (!res.existe_plan) carte = ['alerte', 'Lot introuvable au plan', `Le lot ${esc(code)} n’existe pas au plan cadastral.`];
    else if (!res.valide) carte = ['alerte', 'Lot indisponible', esc((res.blocages || []).join(' · '))];
    else {
      const type = l && l.type_villa;
      const meme = type && etat.detail.type_villa && type === etat.detail.type_villa;
      carte = type && etat.detail.type_villa && !meme
        ? ['vigilance', `⚠ Lot disponible, mais type différent : ${esc(type)} au lieu de ${esc(etat.detail.type_villa)}`,
           'Le règlement commun suppose des villas comparables : vérifiez le lot et la part du prix.']
        : ['succes', '✓ Lot disponible', `${esc((l && (l.nom_phase || l.code_phase)) || '—')} · ${esc(type || '—')}${meme ? ' · même type que le lot ' + esc(etat.detail.code_lot) : ''}`];
    }
    $('do-t-feedback').innerHTML = `<div class="do-r-carte ${carte[0]}"><h4>${carte[1]}</h4><p>${carte[2]}</p></div>`;
    $('do-t-valider').disabled = !res.valide || !res.existe_plan || code === etat.detail.code_lot;
  } catch (e) {
    $('do-t-feedback').innerHTML = `<div class="do-r-carte alerte"><h4>Erreur de vérification</h4><p>${esc(e.message)}</p></div>`;
  }
}

export async function validerRattachement() {
  $('do-t-valider').disabled = true;
  messageDlg('do-t-msg', 'Rattachement en cours…');
  try {
    await SIG.api(`/api/dossiers/${etat.detail.id}/rattacher-lot/`, {
      method: 'POST', body: { code_lot: $('do-t-lot').value.trim(), motif: $('do-t-motif').value.trim(),
        ...($('do-t-part').value !== '' ? { part_prix: Number($('do-t-part').value) } : {}) } });
    $('do-dlg-rattachement').close();
    await chargerDetail(etat.detail.id);
    msgFiche('Lot rattaché : il partage le règlement de ce dossier, sans échéancier propre.', false);
    if (APP.clients && APP.clients.courant) APP.clients.ouvrirClient(APP.clients.courant);
  } catch (e) {
    messageDlg('do-t-msg', 'Erreur : ' + e.message, true);
    $('do-t-valider').disabled = false;
  }
}

export async function detacherLot() {
  if (!(await APP.ui.confirmer({
    titre: `Détacher le lot ${etat.detail.code_lot} de son dossier principal ?`,
    texte: 'Le lot redeviendra disponible.',
    danger: true,
  }))) return;
  try {
    const principal = await SIG.api(`/api/dossiers/${etat.detail.id}/detacher-lot/`, { method: 'POST' });
    await chargerDetail(principal.id);
    msgFiche('Lot détaché : il est de nouveau disponible.', false);
    if (APP.clients && APP.clients.courant) APP.clients.ouvrirClient(APP.clients.courant);
  } catch (e) {
    msgFiche('Erreur : ' + e.message, true);
  }
}

// ---------------------------------------------------------------- déplacer un dossier scanné mal placé
// Le scan part avec ses bordereaux lus ; les versements déjà consignés depuis lui sont annulés ici
// et ressaisis dans le dossier cible (DeplacerScanView).
export function ouvrirDeplacement(docId) {
  scanADeplacer = (etat.detail.documents || []).find((doc) => doc.id === docId);
  if (!scanADeplacer) return;
  cibleScan = null;
  const bordereaux = (scanADeplacer.versements || []).filter((v) => v.montant > 0);
  $('do-s-scan').innerHTML = `<strong>${esc(scanADeplacer.chemin.split('/').pop())}</strong>
    <span class="aide">Actuellement : lot ${esc(scanADeplacer.code_lot || '—')} · dossier de ${esc(etat.detail.acquereur_nom || '—')}.
    ${bordereaux.length ? `Il emporte ${pl(bordereaux.length, 'bordereau lu', 'bordereaux lus')} (${esc(fcfa(bordereaux.reduce((t, v) => t + v.montant, 0)))});
    les versements déjà consignés depuis ces bordereaux seront annulés ici et ressaisis dans le dossier de destination.` : 'Aucun bordereau lu dans ce scan.'}</span>`;
  $('do-s-q').value = '';
  $('do-s-motif').value = '';
  $('do-s-resultats').innerHTML = '';
  $('do-s-msg').className = '';
  $('do-s-msg').textContent = '';
  actualiserDeplacement();
  $('do-dlg-deplacer').showModal();
  $('do-s-q').focus();
}

export async function chercherCibleScan(q) {
  const texte = (q || '').trim();
  cibleScan = null;
  actualiserDeplacement();
  if (!texte) { $('do-s-resultats').innerHTML = ''; return; }
  try {
    const liste = (await SIG.api('/api/dossiers/?q=' + encodeURIComponent(texte)))
      .filter((x) => x.id !== etat.detail.id).slice(0, 12);
    if (($('do-s-q').value || '').trim() !== texte) return;
    const lotSeul = /^[0-9]+[A-Z -]*$/i.test(texte) && !liste.some((x) => x.code_lot === texte && x.statut_dossier === 'actif');
    $('do-s-resultats').innerHTML = `<ul class="do-s-liste">${liste.map((x) => `
      <li><label><input type="radio" name="do-s-cible" value="d:${x.id}">
        <span><strong>Lot ${esc(x.code_lot || '—')}</strong> · ${esc(x.acquereur_nom || '—')}
        <span class="aide">${esc(x.statut_dossier)}${x.dossier_principal_id ? ' · lot rattaché : versements sur le dossier principal' : ''}</span></span></label></li>`).join('')}
      ${lotSeul ? `<li><label><input type="radio" name="do-s-cible" value="l:${esc(texte)}">
        <span><strong>Lot ${esc(texte)}</strong> sans dossier <span class="aide">le scan restera sans client, à rattacher plus tard</span></span></label></li>` : ''}
      </ul>${liste.length || lotSeul ? '' : '<p class="aide">Aucun dossier ne correspond.</p>'}`;
    $('do-s-resultats').querySelectorAll('input[name="do-s-cible"]').forEach((r) => r.addEventListener('change', () => {
      cibleScan = r.value;
      actualiserDeplacement();
    }));
  } catch (e) {
    $('do-s-resultats').innerHTML = `<div class="do-r-carte alerte"><h4>Erreur de recherche</h4><p>${esc(e.message)}</p></div>`;
  }
}

export function actualiserDeplacement() {
  $('do-s-valider').disabled = !cibleScan || !($('do-s-motif').value || '').trim();
}

export async function validerDeplacement() {
  $('do-s-valider').disabled = true;
  messageDlg('do-s-msg', 'Déplacement en cours…');
  const genre = cibleScan.slice(0, 1), valeur = cibleScan.slice(2);
  try {
    const r = await SIG.api(`/api/documents/${scanADeplacer.id}/deplacer/`, {
      method: 'POST', body: { ...(genre === 'd' ? { dossier_id: Number(valeur) } : { code_lot: valeur }),
        motif: $('do-s-motif').value.trim() } });
    $('do-dlg-deplacer').close();
    await chargerDetail(etat.detail.id);
    msgFiche(`Scan « ${r.nom_fichier} » déplacé vers le lot ${r.code_lot || '—'}${r.dossier_id ? '' : ' (sans dossier)'} : `
      + `${pl(r.bordereaux, 'bordereau suit', 'bordereaux suivent')} le scan, `
      + `${pl(r.versements_deplaces, 'versement consigné reporté', 'versements consignés reportés')}.`, false);
    if (APP.clients && APP.clients.courant) APP.clients.ouvrirClient(APP.clients.courant);
  } catch (e) {
    messageDlg('do-s-msg', 'Erreur : ' + e.message, true);
    actualiserDeplacement();
  }
}
