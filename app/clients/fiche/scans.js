// Fiche client : onglet « Scans & OCR » (rapprochement, conformité, pièces des dossiers scannés).
import { ACTES, ALERTES, CHAMPS, dateFr, PIECES } from '../commun.js';
import { nomPdf, retenirNoms } from './commun.js';
const { esc, num } = APP;

// ---------- BOÎTE RAPPROCHEMENT INTELLIGENT OCR ----------
export function ocrBoxHTML(c) {
  const d = c.donnees_extraites || {};
  const cles = Object.keys(d).filter((k) => d[k] && d[k].valeur != null);
  if (!cles.length) {
    return `
        <div class="cl-card" style="padding:14px;background:var(--creux);">
         <div class="cl-card-titre" style="font-size:0.7812rem;color:var(--gris);">Rapprochement OCR</div>
        <p class="aide" style="margin:6px 0 0;">Aucune donnée extraite des scans pour le moment.</p>
      </div>`;
  }

  const acq = c.acquereur || {};
  const items = cles.map((k) => {
    const valOcr = String(d[k].valeur).trim();
    const page = d[k].page;
    const docId = d[k].document_id;
    let valEnreg = '';
    if (k === 'piece_identite') valEnreg = acq.piece_numero || '';
    else if (k === 'date_naissance') valEnreg = acq.date_naissance ? String(acq.date_naissance).slice(0, 10) : '';
    else if (k === 'lieu_naissance') valEnreg = acq.lieu_naissance || '';
    else if (k === 'nationalite') valEnreg = acq.nationalite || '';
    else if (k === 'profession') valEnreg = acq.profession || '';
    else if (k === 'adresse') valEnreg = acq.adresse || '';
    else if (k === 'telephone') valEnreg = acq.telephone || '';
    else if (k === 'email') valEnreg = acq.email || '';
    else if (k === 'nom') valEnreg = acq.nom || c.nom || '';

    const conforme = valEnreg && (valEnreg.toLowerCase() === valOcr.toLowerCase() || valOcr.toLowerCase().includes(valEnreg.toLowerCase()));

    return `
      <div class="cl-ocr-champ-item">
        <div>
          <span class="cl-ocr-champ-label">${esc(CHAMPS[k] || k)}</span>
          <div style="font-size:0.75rem;color:var(--encre);font-weight:600;">
            ${esc(valOcr)}
            ${page && docId ? `<button type="button" class="lien" data-doc="${docId}" data-page="${page}" style="font-size:0.6875rem;margin-left:4px;">p. ${page}</button>` : ''}
          </div>
        </div>
        <div>
          ${conforme
            ? '<span class="cl-badge succes" style="font-size:0.625rem;">Conforme</span>'
            : (valEnreg ? '<span class="cl-badge vigilance" style="font-size:0.625rem;">Écart</span>' : '<span class="cl-badge alerte" style="font-size:0.625rem;">Nouveau</span>')}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="cl-ocr-suggestion">
      <div class="cl-ocr-suggestion-tete">
        <strong>${cles.length} données lues sur les scans</strong>
        <button type="button" class="bouton micro" data-action="rapprocher-ocr" data-ref="${esc(c.ref)}" title="Copier instantanément ces valeurs dans le profil acquéreur">
          Synchroniser avec le scan
        </button>
      </div>
      <p class="aide" style="margin:0 0 8px;">Informations extraites automatiquement par OCR du contrat et de la CNI :</p>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${items}
      </div>
    </div>
  `;
}

// ---------- CONFORMITÉ & CONTRÔLE DOCUMENTAIRE ----------
export function conformiteBoxHTML(c, versOcr) {
  const acq = c.acquereur || {};
  const docs = c.documents || [];
  const aPiece = !!(acq.piece_numero || (c.donnees_extraites && c.donnees_extraites.piece_identite));
  const aContrat = docs.some((d) => (d.pages || []).some((p) => p.type_piece === 'contrat_reservation' || p.type_piece === 'contrat'));
  const alertesOuvertes = [...new Set(docs.flatMap((d) => (d.alertes || []).filter((a) => a !== 'OCR_INCOMPLET')))];

  return `
    <div class="cl-card">
      <div class="cl-card-entete">
        <h4 class="cl-card-titre">Contrôle & conformité</h4>
        <span class="cl-badge ${alertesOuvertes.length ? 'vigilance' : 'succes'}">
          ${alertesOuvertes.length ? alertesOuvertes.length + ' écart(s)' : 'Dossier conforme'}
        </span>
      </div>
      <div class="cl-conformite-item">
        <span>Pièce d'identité (CNI / Passeport)</span>
        <span class="cl-badge ${aPiece ? 'succes' : 'alerte'}">${aPiece ? 'Reconnue' : 'Manquante'}</span>
      </div>
      <div class="cl-conformite-item">
        <span>Contrat de réservation signé</span>
        <span class="cl-badge ${aContrat ? 'succes' : 'doux'}">${aContrat ? 'Signé' : 'À vérifier'}</span>
      </div>
      <div class="cl-conformite-item">
        <span>Versements justifiés</span>
        <span class="cl-badge ${versOcr.length ? 'succes' : 'doux'}">${versOcr.length} bordereau(x)</span>
      </div>
      ${alertesOuvertes.length ? `
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--trait);">
          <strong style="font-size:0.7188rem;color:#86282b;">Écarts détectés à vérifier :</strong>
          <ul class="cl-alertes" style="margin-top:6px;">
            ${alertesOuvertes.map((a) => `<li><a href="#validation">${esc(ALERTES[a.split(':')[0]] || a)}</a></li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

const lienPage = (doc, page) => (page ? `<button type="button" class="lien" data-doc="${doc}" data-page="${page}" aria-label="Voir la page ${page} du dossier scanné">p. ${page}</button>` : '');

export function pieces(docs) {
  retenirNoms(docs);
  if (!docs.length) return '<p class="aide">Aucun dossier scanné rattaché à ce client. Le bouton « + Rattacher un dossier scanné », en haut de cette carte, propose les scans que l’extraction n’a rattachés à personne.</p>';
  return docs.map((d) => {
    const reaf = d.champs && d.champs.reaffectation;
    const reafBadge = reaf ? `<span class="cl-badge vigilance" style="margin-left:6px;" title="Avenant de réaffectation : lot initial ${esc(reaf.ancien_lot || '')} changé contre villa ${esc(reaf.nouveau_lot || '')}">🔄 Avenant lot ${esc(reaf.chaine && reaf.chaine.length > 2 ? reaf.chaine.join(' ➔ ') : (reaf.ancien_lot || '—') + ' ➔ ' + (reaf.nouveau_lot || '—'))}</span>` : '';
    const partageTexte = d.partage_avec || ((d.clients_lies || []).filter((l) => !l.principal).map((l) => l.nom || l.client_id).join(', '));
    const partageBadge = partageTexte ? `<span class="cl-badge doux" style="margin-left:6px;" title="Scan partagé avec ${esc(partageTexte)}">partagé avec ${esc(partageTexte)}</span>` : '';
    const ces = (d.champs && d.champs.cessions) || [];
    const actes = (d.champs && d.champs.actes) || [];
    const fin = d.champs && d.champs.titulaire_final;
    const acteTexte = (a) => {
      if (a.type === 'avenant') return ` : lot ${esc(a.lot_avant || '—')} ➔ ${esc(a.lot_apres || '—')}`;
      if (a.nouveau_titulaire) return ` : ${esc(a.ancien_titulaire || '—')} ➔ <strong>${esc(a.nouveau_titulaire)}</strong>`;
      if (a.titulaire) return ` : ${esc(a.titulaire)}${a.mandataire ? ' (mandataire ' + esc(a.mandataire) + ')' : ''}`;
      return '';
    };
    const estFinal = (a) => fin && a.nouveau_titulaire === fin.valeur && a.page === fin.page;
    const groupes = new Map();
    d.pages.forEach((p) => (groupes.get(p.type_piece) || groupes.set(p.type_piece, []).get(p.type_piece)).push(p.page));
    return `<div class="cl-doc"${APP.ancre('piece', 'scan-' + d.id, `Dossier scanné ${nomPdf(d.chemin) || d.code_lot || d.id}`)}><div class="cl-doc-tete"><strong>${d.categorie === 'contentieux' ? 'Dossier contentieux' : 'Dossier client'}${d.code_lot ? ' · lot ' + esc(d.code_lot) : ''}${reafBadge}${partageBadge}</strong>
      <span class="aide">${num(d.pages_lues || 0)} / ${num(d.nb_pages || 0)} pages lues</span>
      <button type="button" class="bouton secondaire micro" data-doc="${d.id}" data-page="1">Ouvrir le PDF</button></div>
      ${reaf ? `<p class="aide" style="margin:4px 0 8px;color:#0369a1;"><strong>Avenant de réaffectation :</strong> lot initial ${esc(reaf.ancien_lot || '—')} réaffecté au lot ${esc(reaf.nouveau_lot || '—')}${reaf.chaine && reaf.chaine.length > 2 ? ` (lots successifs : ${esc(reaf.chaine.join(' ➔ '))})` : ''}${reaf.date_avenant ? ' le ' + esc(reaf.date_avenant) : ''}${reaf.page ? ` · <button type="button" class="lien" data-doc="${d.id}" data-page="${reaf.page}">Voir page ${reaf.page}</button>` : ''}</p>` : ''}
      ${ces.length ? `<p class="aide" style="margin:4px 0 8px;color:#0369a1;"><strong>Cession de la villa :</strong> ${ces.map((c) => `${esc(c.cedant || '—')} ➔ ${esc(c.cessionnaire)}${c.lot ? ' (lot ' + esc(c.lot) + ')' : ''} <button type="button" class="lien" data-doc="${d.id}" data-page="${c.page}">page ${c.page}</button>`).join(' ; ')}</p>` : ''}
      ${actes.length ? `<div class="aide" style="margin:4px 0 8px;"><strong>Actes du dossier, dans l’ordre :</strong>
        <ol style="margin:4px 0 0 18px;padding:0;">${actes.map((a) => `<li${a.hors_dossier ? ' style="opacity:.6;"' : ''}>${esc(dateFr(a.date))} · ${esc(ACTES[a.type] || a.type)}${acteTexte(a)}${a.type !== 'avenant' && a.lots && a.lots.length ? ' (lot ' + esc(a.lots.join(', ')) + ')' : ''}${a.hors_dossier ? ' — autre villa' : ''}${estFinal(a) ? ' <span class="cl-badge succes">titulaire final</span>' : ''} ${lienPage(d.id, a.page)}</li>`).join('')}</ol></div>` : ''}
      <ul class="cl-pieces">${[...groupes].map(([t, pages]) => `<li><span>${esc(PIECES[t] || t)}</span>
        ${pages.map((p) => `<button type="button" class="cl-page" data-doc="${d.id}" data-page="${p}" aria-label="${esc(PIECES[t] || t)}, page ${p}">${p}</button>`).join('')}</li>`).join('')}</ul></div>`;
  }).join('');
}
