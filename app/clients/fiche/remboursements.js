// Fiche client : onglet « Désistements & remboursements ».
import { dateFr, moisFr } from '../commun.js';
import { fcfa, tuile } from './commun.js';
const { esc } = APP;

// ---------- CARTE REMBOURSEMENTS & DÉSISTEMENTS ----------
export function desistementsCardHTML(dossiers, remboursements, ref) {
  return `
    <div class="cl-card cl-card-remb">
      <div class="cl-card-entete">
        <h4 class="cl-card-titre" style="color:#86282b;">Désistement(s) enregistré(s)</h4>
        <span class="cl-badge vigilance">${dossiers.length} dossier(s)</span>
      </div>
      ${dossiers.map((d) => {
        const suivi = (remboursements || []).find((r) => r.code_lot === d.code_lot || !r.code_lot);
        return `<div style="margin-bottom:12px;">
          <strong>Lot ${esc(d.code_lot || '—')}</strong>
          <span class="cl-badge doux">Désistement enregistré</span>
          <p class="aide">Date : ${dateFr(d.date_desistement)} · Montant versé au dossier commercial : ${fcfa(d.total_verse)}</p>
          ${suivi
            ? `<a class="bouton secondaire micro" href="#contentieux/remb=${encodeURIComponent(suivi.id)}">Ouvrir la fiche de remboursement</a>`
            : `<p class="note">La fiche de remboursement reste à créer après vérification comptable.</p>
               <a class="bouton secondaire micro" href="#contentieux/demande=${encodeURIComponent(ref)}">Préparer la demande de remboursement</a>`}
        </div>`;
      }).join('')}
    </div>`;
}

export function remboursementsCardHTML(liste) {
  if (!liste || !liste.length) return '';
  const dateAuj = new Date().toISOString().slice(0, 7);

  return `
    <div class="cl-card cl-card-remb">
      <div class="cl-card-entete">
        <h4 class="cl-card-titre" style="color:#86282b;">Dossier de remboursement & désistement</h4>
        <span class="cl-badge vigilance">${liste.length} dossier(s)</span>
      </div>
      ${liste.map((r) => {
        let ech = [];
        if (Array.isArray(r.echeancier)) ech = r.echeancier;
        else if (r.echeancier && Array.isArray(r.echeancier.echeances)) ech = r.echeancier.echeances;
        else if (typeof r.echeancier === 'string') {
          try {
            const parsed = JSON.parse(r.echeancier);
            ech = Array.isArray(parsed) ? parsed : (parsed.echeances || []);
          } catch (e) {}
        }
        const estNouveau = r.type_desistement === 'nouveau' || r.type_dossier === 'nouveau';

        return `
          <div style="margin-bottom: 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
              <strong>${esc(estNouveau ? 'Désistement (échéancier échelonné)' : 'Ancien désistement')} · ${esc(r.nature || 'Désistement')}</strong>
              <span class="aide">${r.code_lot ? 'Lot ' + esc(r.code_lot) + ' · ' : ''}${r.contact ? 'Contact : ' + esc(r.contact) : ''}</span>
              <!-- Le traitement (échéancier, encaissements, désistement) vit dans la page Contentieux :
                   la fiche client n'en est que le résumé, elle ouvre l'écran où l'on agit. -->
              <a class="bouton secondaire micro" href="#contentieux/remb=${encodeURIComponent(r.id)}"
                 title="Ouvrir la fiche de remboursement : échéancier, encaissements, suivi et désistement">Ouvrir la fiche de remboursement</a>
            </div>
            <div class="tuiles cl-tuiles" style="margin: 8px 0 12px;">
              ${tuile('Montant engagé', fcfa(r.montant_a_rembourser), 'Créance')}
              ${tuile('Déjà remboursé', fcfa(r.montant_rembourse), 'Restitué')}
              ${tuile('Solde restant', fcfa(r.solde_restant), r.mode_paiement ? 'Mode : ' + r.mode_paiement : '')}
            </div>
            ${(r.suivi || r.observations) ? `<p class="aide" style="margin-bottom:8px;"><em>Note : ${esc(r.suivi || r.observations)}</em></p>` : ''}
            ${ech.length ? `
              <div>
                <strong style="font-size: 0.6875rem; text-transform: uppercase; letter-spacing: .08em; color: #86282b;">Échéancier prévisionnel (${ech.length} mensualités)</strong>
                <div class="cl-table" style="margin-top: 6px;"><table>
                  <thead><tr><th>Mois</th><th class="n">Montant dû</th><th>Statut</th></tr></thead>
                  <tbody>
                    ${ech.map((e) => {
                      const dStr = e.date || e.mois || '';
                      const m = dStr.slice(0, 7);
                      const echue = e.statut === 'echue' || (m && m < dateAuj);
                      return `<tr>
                        <td><strong>${esc(moisFr(dStr))}</strong> <span class="aide">(${esc(m || '—')})</span></td>
                        <td class="n">${fcfa(e.montant)}</td>
                        <td>${echue ? '<span class="cl-badge vigilance">Échue</span>' : '<span class="cl-badge doux">À venir</span>'}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table></div>
              </div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}
