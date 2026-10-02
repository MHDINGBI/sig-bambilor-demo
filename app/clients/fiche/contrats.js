// Fiche client : cartes des contrats et avis contentieux.
import { ANOMALIES, dateFr } from '../commun.js';
import { fcfa, rapprochementLot } from './commun.js';
const { esc } = APP;

export function dossiersCartes(liste, lots, refClient, roleActif, versOcr, idChoisi) {
  if (!liste.length) {
    return `
      <div style="text-align:center;padding:34px 20px;background:var(--creux);border:1px dashed var(--trait-fort);border-radius:8px;">
        <h4 style="margin:0 0 6px;">Aucun dossier commercial actif pour cet acquéreur</h4>
        <p class="aide" style="max-width:480px;margin:0 auto 16px;line-height:1.5;">
          Cet acquéreur est enregistré mais ne possède pas encore de lot attribué ou de contrat de vente.<br>
          Affectez-lui un lot disponible et saisissez ses conditions de vente.
        </p>
        ${(roleActif === 'commercial' || roleActif === 'direction') ? `
          <button type="button" class="bouton petit" data-action="creer-dossier" data-ref="${esc(refClient)}">
            + Affecter un lot et créer le dossier
          </button>
        ` : '<span class="cl-badge doux">Affectation réservée au pôle commercial</span>'}
      </div>`;
  }

  // Une ligne compacte par contrat (dossier principal) ; ses lots rattachés y figurent sans ligne propre.
  // Le détail du contrat choisi (échéancier, versements, actes, scans) s'affiche dessous, en sous-onglets :
  // la liste reste courte même pour un acquéreur à plusieurs contrats. Le suivi administratif du classeur
  // (avenant, attestations) et la ventilation entre lots rattachés sont dans ce détail.
  const principaux = liste.filter((d) => !d.dossier_principal_id);
  return `<div class="cl-contrat-lots" role="tablist" aria-label="Contrats du client">${principaux.map((d) => {
    const rattaches = liste.filter((r) => r.dossier_principal_id === d.id);
    const lot = (lots || []).find((l) => l.code_lot === d.code_lot);
    const tv = (lot && lot.type_villa) || d.type_villa || '';
    const ph = (lot && lot.nom_phase) || '';
    const pctVerse = (d.prix_vente && d.total_verse != null) ? Math.min(100, Math.round((d.total_verse / d.prix_vente) * 100)) : 0;
    const solde = d.reliquat != null && Number(d.reliquat) <= 0;
    const r = rapprochementLot(versOcr, d);

    return `
      <div class="cl-dossier-carte${d.statut_dossier === 'desistement' ? ' desiste' : ''}"${d.code_lot ? APP.ancre('lot', d.code_lot, `Lot ${d.code_lot} · contrat ${d.numero_dossier || '#' + d.id}`) : ''} role="tab" tabindex="0" data-lot-contrat="${d.id}" aria-selected="${d.id === idChoisi || rattaches.some((x) => x.id === idChoisi)}" aria-controls="cl-contrat-detail">
        <div class="cl-dossier-lot-titre">
          <span class="c-etiquette cl-contrat-num">Contrat ${esc(d.numero_dossier || '#' + d.id)}</span>
          ${d.code_lot ? `<strong class="cl-badge-lot">Lot ${esc(d.code_lot)}</strong>` : '<span class="cl-badge alerte">Sans lot</span>'}
          ${rattaches.map((x) => `<span class="cl-badge-lot" title="Lot rattaché : réglé par ce contrat">+ Lot ${esc(x.code_lot || '—')}</span>`).join('')}
          <span class="aide cl-contrat-type">${esc([tv, ph, d.option_paiement].filter(Boolean).join(' · '))}${d.date_reservation ? ' · réservé le ' + dateFr(d.date_reservation) : ''}</span>
        </div>
        <div class="cl-contrat-reglement" title="${esc(fcfa(d.total_verse))} versés sur ${esc(fcfa(d.prix_vente))}">
          <div class="cl-jauge-wrap"><div class="cl-jauge-barre" style="width:${pctVerse}%;background:${solde ? '#2e7d32' : (pctVerse > 50 ? '#0284c7' : '#d97706')};"></div></div>
          <span class="aide">${pctVerse} % · reste <strong>${fcfa(d.reliquat)}</strong></span>
        </div>
        <div class="cl-contrat-etats">
          <span class="cl-badge ${d.statut_dossier === 'desistement' ? 'alerte' : solde ? 'succes' : (d.statut_dossier === 'actif' ? '' : 'doux')}">${d.statut_dossier === 'desistement' ? 'Désisté' : solde ? 'Soldé' : esc(d.statut_dossier || 'Actif')}</span>
          ${(d.anomalies && d.anomalies.length) ? `<span class="cl-badge alerte" title="${esc(d.anomalies.map((a) => ANOMALIES[a] || a).join(' · '))}">${d.anomalies.length} anomalie${d.anomalies.length > 1 ? 's' : ''}</span>` : ''}
          ${r ? (r.concorde
            ? `<span class="cl-badge succes" title="Bordereaux lus ${esc(fcfa(r.lus))} sur ${esc(fcfa(r.fichier))} déclarés au fichier">bordereaux concordants</span>`
            : `<span class="cl-badge alerte" title="Bordereaux lus ${esc(fcfa(r.lus))} / fichier commercial ${esc(fcfa(r.fichier))}">${r.ecart > 0 ? 'excédent' : 'manquant'} ${esc(fcfa(Math.abs(r.ecart)))}</span>`) : ''}
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

// Avis posé en tête de l'onglet Dossiers : le client a un volet contentieux, qui vit ailleurs.
export function avisContentieuxHTML(c, docs) {
  const remb = (c.remboursements || []).find((r) => r.nature === 'Contentieux');
  const href = docs.length ? `#contentieux/ref=${encodeURIComponent(c.ref)}`
    : (remb ? `#contentieux/remb=${encodeURIComponent(remb.id)}` : '#contentieux');
  return `<div class="cl-avis-contentieux" role="note">
    <p><strong>Ce client a un dossier contentieux.</strong>
      ${docs.length ? `${APP.pl(docs.length, 'pièce scannée', 'pièces scannées')} — ` : ''}Il ne fait pas partie des dossiers du client :
      il se consulte et se traite dans la page Contentieux &amp; Remboursements.</p>
    <a class="bouton secondaire micro" href="${href}">Ouvrir dans Contentieux &amp; Remboursements</a>
  </div>`;
}
