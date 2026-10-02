// Fiche client : règlements réconciliés, une carte par contrat.
import { dateFr, estFrais } from '../commun.js';
import { fcfa } from './commun.js';
const { esc } = APP;

// ---------- RÈGLEMENTS RÉCONCILIÉS, UNE CARTE PAR CONTRAT ----------
// Un bordereau appartient au lot de son scan : il va sur le contrat qui porte ce lot (principal ou rattaché).
// Ce qui ne correspond à aucun contrat (lot non lu, dossier désisté sans lot) reste dans une carte à part.
export function versementsParContrat(versOcr, dossiers, roleActif) {
  const principaux = dossiers.filter((d) => !d.dossier_principal_id);
  const contratDuLot = new Map();
  principaux.forEach((p) => {
    [p, ...dossiers.filter((d) => d.dossier_principal_id === p.id)].forEach((d) => {
      if (d.code_lot) contratDuLot.set(d.code_lot, p.id);
    });
  });
  const parContrat = new Map(principaux.map((p) => [p.id, []]));
  const autres = [];
  versOcr.forEach((v) => {
    const id = contratDuLot.get(v.document && v.document.code_lot);
    (id != null ? parContrat.get(id) : autres).push(v);
  });
  const peutEnregistrer = roleActif === 'recouvrement' || roleActif === 'commercial';
  const carte = (titre, sousTitre, liste, dossierId) => {
    const total = liste.filter((v) => !estFrais(v)).reduce((s, v) => s + (v.montant || 0), 0);
    return `<div class="cl-card cl-vers-contrat">
      <div class="cl-card-entete">
        <h4 class="titre-section cl-card-titre">${titre} <span class="aide">${sousTitre}</span></h4>
        <span class="aide">${APP.pl(liste.length, 'bordereau', 'bordereaux')} · ${fcfa(total)}</span>
        ${peutEnregistrer && dossierId ? `<button type="button" class="bouton micro" data-action="versement" data-dossier-id="${dossierId}">+ Enregistrer versement</button>` : ''}
      </div>
      ${versementsTable(liste, roleActif, dossierId)}
    </div>`;
  };
  const cartes = principaux.map((p) => {
    const lots = [p, ...dossiers.filter((d) => d.dossier_principal_id === p.id)].map((d) => d.code_lot).filter(Boolean);
    const statut = p.statut_dossier && p.statut_dossier !== 'actif' ? ` · ${esc(p.statut_dossier)}` : '';
    return carte(`Contrat ${esc(p.numero_dossier || '#' + p.id)}`, `${lots.length ? 'Lot ' + esc(lots.join(', ')) : 'sans lot'}${statut}`,
      parContrat.get(p.id), p.id);
  });
  if (autres.length) cartes.push(carte('Autres bordereaux', 'lot non rattaché à un contrat', autres, null));
  return cartes.length ? cartes.join('') : carte('Règlements & versements', '', [], null);
}

// ---------- TABLEAU DES RÈGLEMENTS RÉCONCILIÉS ----------
function versementsTable(liste, roleActif, premierDossierId) {
  if (!liste.length) {
    return `
      <div style="text-align:center;padding:24px;background:var(--creux);border-radius:6px;color:var(--gris);">
        <p style="margin:0 0 10px;">Aucun versement ou bordereau enregistré pour le moment.</p>
        ${(roleActif === 'recouvrement' || roleActif === 'commercial') && premierDossierId ? `
          <button type="button" class="bouton micro" data-action="versement" data-dossier-id="${premierDossierId}">
            + Enregistrer le premier versement
          </button>
        ` : ''}
      </div>`;
  }

  return `
    <div class="cl-table"><table>
      <thead>
        <tr>
          <th>Date</th>
          <th>N° Pièce / Reçu</th>
          <th>Nature</th>
          <th class="n">Montant</th>
          <th>Scan source</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        ${liste.map((v) => {
          const estF = estFrais(v);
          return `<tr${APP.ancre('versement', 'ocr-' + v.id, `Bordereau n° ${v.numero || '—'} du ${dateFr(v.date_versement)} · ${fcfa(v.montant)}`)}>
            <td><strong>${dateFr(v.date_versement)}</strong></td>
            <td>${esc(v.numero || '—')}</td>
            <td>
              <span class="cl-badge ${estF ? 'vigilance' : 'doux'}">${esc(v.nature || (estF ? 'Frais de dossier' : 'Apport'))}</span>
            </td>
            <td class="n" style="font-weight:700;color:${estF ? 'var(--gris)' : '#2e7d32'};">
              ${fcfa(v.montant)}
            </td>
            <td>
              ${v.document ? `
                <button type="button" class="cl-page" data-doc="${v.document.id}" data-page="${v.page || 1}" title="Ouvrir la page ${v.page} du bordereau scanné">
                  Bordereau p. ${v.page || 1}
                </button>
              ` : '—'}
            </td>
            <td>
              <span class="cl-badge succes">Vérifié OCR</span>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  `;
}
