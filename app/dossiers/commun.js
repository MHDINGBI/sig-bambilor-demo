// Dossiers — état partagé, helpers et rendus purs de la fiche (audit 23/09, R09 : découpage du front).
// Les actions (versements, réaffectation, assistant…) vivent dans leurs modules ; la fiche dans fiche.js.
const { $, esc, num, pct, pl } = APP;
export const fcfa = SIG.fmtFCFA;

export const NATURES = { apport: 'Apport', frais_dossier: 'Frais de dossier', remboursement: 'Remboursement' };
export const MODES = { virement: 'Virement', cheque: 'Chèque', especes: 'Espèces', versement_banque: 'Versement en banque' };
export const ARRONDIS = [1000, 5000, 10000, 100000];

// ---------- état mutable ----------
export const etat = {
  detail: null, jauge: null,
  conteneurMonte: null,
  assistant: null,        // état de l'assistant « nouveau dossier »
  sousOngletActif: 'synthese',  // sous-onglet du détail dans la fiche client, gardé d'un contrat à l'autre
  timers: { reaffectation: null, rattachement: null, deplacement: null },
};

// Registre des actions définies ailleurs : la racine dossiers.js y enregistre construire(), que
// ouvrirVersement/ouvrirReaffectation/ouvrirRattachement/ouvrirAssistant appellent sans dépendre de la racine
// (évite un cycle d'imports racine ↔ modules).
export const actions = {};

// ---------- helpers ----------
export const cfg = () => APP.cfg || {};
export const peutEcrire = () => !!(APP.aRole && APP.aRole('commercial'));
// changer ou rattacher un lot : commercial et direction (matrice des accès, sig/acces.py)
export const peutChangerLot = () => !!(APP.aRole && (APP.aRole('commercial') || APP.aRole('direction')));
export const dateFr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
export const aujourdhui = () => new Date().toISOString().slice(0, 10);
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const lien = (id) => '#dossiers/id=' + encodeURIComponent(id);
export const cible = () => etat.conteneurMonte || $('do-contenu');
// Tri naturel des codes de lot : « 4, 8, 342, 1281 BIS » et non l'ordre texte « 1281, 1997, 342, 4 ».
// Sert à la liste des lots de la réaffectation et à la répartition des lots de l'assistant.
export const comparerNaturel = (a, b) => {
  const va = String(a ?? '').trim();
  const vb = String(b ?? '').trim();
  if (!va || !vb) return va === vb ? 0 : (va ? -1 : 1);
  return va.localeCompare(vb, 'fr', { numeric: true });
};

// Décale une date ISO de k mois en gardant le jour (31 janvier + 1 mois → 28/29 février)
export function moisPlus(iso, k) {
  const [y, m, d] = iso.split('-').map(Number);
  const dernier = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + k, Math.min(d, dernier))).toISOString().slice(0, 10);
}

export function moisEntre(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
}

// ---------- messages et jauge ----------
export function msgFiche(texte, erreur) {
  const el = $('do-msg-fiche');
  if (!el) return;
  el.textContent = texte || '';
  el.className = texte ? (erreur ? 'msg erreur' : 'msg succes') : '';
}

export function messageDlg(id, texte, erreur) {
  const el = $(id);
  el.textContent = texte;
  el.className = erreur ? 'msg erreur' : 'msg succes';
}

export function dessinerJauge(ratio) {
  const el = $('do-jauge');
  if (!el) return;
  if (etat.jauge) { etat.jauge.dispose(); etat.jauge = null; }
  etat.jauge = echarts.init(el, null, { renderer: 'svg' });
  etat.jauge.setOption({
    series: [{
      type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, radius: '96%',
      progress: { show: true, width: 16, itemStyle: { color: APP.jeton('--accent') } },
      axisLine: { lineStyle: { width: 16, color: [[1, APP.jeton('--creux')]] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: false, offsetCenter: [0, 0], fontSize: 30, fontWeight: 800,
        fontFamily: APP.jeton('--titre'), color: APP.jeton('--encre'), formatter: (v) => pct(v / 100),
      },
      data: [{ value: Math.round(ratio * 100) }],
    }],
  });
  new ResizeObserver(() => etat.jauge && etat.jauge.resize()).observe(el);
}

// ---------- rendus purs : tuiles et tables ----------
export const tuile = (l, v, s, alerte) => `<div class="tuile do-tuile${alerte ? ' alerte' : ''}">
    <h3>${esc(l)}</h3><span class="valeur"><span class="nb">${esc(v)}</span></span>
    ${s ? `<p class="contexte">${esc(s)}</p>` : ''}</div>`;

export function etatEcheance(e) {
  if (e.paye) return { classe: 'payee', libelle: 'Payée' };
  if (e.date_echeance && e.date_echeance < aujourdhui()) return { classe: 'retard', libelle: 'En retard' };
  return { classe: 'avenir', libelle: 'À venir' };
}

export function tableEcheances(liste) {
  if (!liste.length) return '<p class="vide">Aucune échéance enregistrée.</p>';
  return `<div class="cl-table do-table"><table>
    <caption class="visuellement-cache">Échéancier du dossier</caption>
    <thead><tr><th>Rang</th><th>Libellé</th><th>Échéance</th><th class="n">Montant</th><th>État</th></tr></thead><tbody>
    ${liste.map((e) => {
      const et = etatEcheance(e);
      return `<tr class="do-ech-${et.classe}"><td>${num(e.rang)}</td><td>${esc(e.libelle || '—')}</td>
        <td>${dateFr(e.date_echeance)}</td><td class="n">${esc(fcfa(e.montant))}</td>
        <td><span class="do-etat ${et.classe}">${et.libelle}</span></td></tr>`;
    }).join('')}
    </tbody><tfoot><tr><th colspan="3">Total</th>
      <td class="n">${esc(fcfa(liste.reduce((t, e) => t + (e.montant || 0), 0)))}</td><td></td></tr></tfoot></table></div>`;
}

export function tableVersementsProposes(liste, ecrit, tout = liste) {
  if (!liste || !liste.length) return '';
  return `<div class="cl-table do-table"><table>
    <caption class="visuellement-cache">Versements OCR à rapprocher</caption>
    <thead><tr><th>Document</th><th>Page</th><th>N° Pièce / Bordereau</th><th>Date</th><th>Nature</th>
      <th class="n">Montant</th><th>Actions</th></tr></thead><tbody>
    ${liste.map((v) => `<tr>
      <td>${esc(v.nom_fichier || 'Document ' + v.document_id)}</td>
      <td>Page ${num(v.page)}</td>
      <td><strong>${esc(v.numero || '—')}</strong></td>
      <td>${dateFr(v.date_versement)}</td>
      <td>${esc(NATURES[v.nature] || v.nature || '—')}</td>
      <td class="n">${esc(fcfa(v.montant))}</td>
      <td class="do-actions-cell">
        <button type="button" class="lien" data-voir-doc="${num(v.document_id)}" data-page="${num(v.page)}">Voir pièce</button>
        ${ecrit ? `<button type="button" class="bouton petit" data-pre-saisir="${tout.indexOf(v)}">Rapprocher</button>` : ''}
      </td></tr>`).join('')}
    </tbody></table></div>`;
}

export function tableVersements(liste, ecrit) {
  if (!liste.length) return '<p class="vide">Aucun versement enregistré.</p>';
  return `<div class="cl-table do-table"><table>
    <caption class="visuellement-cache">Versements du dossier</caption>
    <thead><tr><th>N° de reçu</th><th>Date</th><th>Nature</th><th>Mode</th><th>Référence</th>
      <th class="n">Montant</th><th>Saisi par</th><th>Actions</th></tr></thead><tbody>
    ${liste.map((v) => `<tr class="${v.annule ? 'do-annule' : ''}"${APP.ancre('versement', v.id, `Versement reçu n° ${v.numero_recu || '—'} du ${dateFr(v.date_versement)} · ${fcfa(v.montant)}`)}>
      <td>${esc(v.numero_recu || '—')}</td><td>${dateFr(v.date_versement)}</td>
      <td>${esc(NATURES[v.nature] || v.nature || '—')}</td><td>${esc(MODES[v.mode] || v.mode || '—')}</td>
      <td>${esc(v.reference || '—')}</td><td class="n">${esc(fcfa(v.montant))}</td>
      <td>${esc(v.saisi_par || '—')}</td>
      <td class="do-actions-cell">
        <button type="button" class="lien" data-recu="${num(v.id)}">Reçu</button>
        ${!v.annule && ecrit ? `<button type="button" class="lien" data-annuler="${num(v.id)}" data-recu-numero="${esc(v.numero_recu || '')}">Annuler</button>` : ''}
        ${v.annule ? `<span class="aide">Annulé : ${esc(v.motif_annulation || 'sans motif')}</span>` : ''}
      </td></tr>`).join('')}
    </tbody></table></div>`;
}

export function listePieces(liste) {
  if (!liste.length) return '<p class="vide">Aucune pièce jointe.</p>';
  return `<ul class="do-pieces">${liste.map((p) => `<li${APP.ancre('piece', p.id, `Pièce jointe ${p.nom_fichier || '#' + p.id}`)}>
    <a href="${esc(APP.url(p.url || '/api/pieces/' + p.id + '/'))}" target="_blank" rel="noopener">${esc(p.nom_fichier || 'Pièce ' + p.id)}</a>
    <span class="aide">${esc(p.categorie || '')} ${p.le ? '· ' + dateFr(p.le) : ''}${p.par ? ' · ' + esc(p.par) : ''}</span>
  </li>`).join('')}</ul>`;
}

// ---------- actes du contrat : avenants, changements de titulaire, attestations ----------
// Relevés par l'OCR dans les PDF scannés (champs.actes, etl/import_dossiers_ocr.py lire_actes) et confrontés au
// suivi administratif du classeur commercial (sig.dossiers_suivi), lot par lot du contrat.
export const SUIVI_OUI = /^(OK|OUI|SOLD[ÉE]|O|X|ACTE DE CESSION)$/i;
export const SUIVI_NON = /^(NEANT|NÉANT|NON|N|-|RAS|AUCUN)$/i;
export const CATEGORIES_ACTES = [
  { titre: 'Avenants et changements de titulaire', suivi: 'avenant',
    types: ['avenant', 'cession', 'substitution', 'transfert', 'changement_nom', 'succession'] },
  { titre: 'Attestation de prise de possession', suivi: 'attestation_prise_possession', types: ['attestation_possession'] },
  { titre: 'Attestation de solde', suivi: 'attestation_solde', types: ['attestation_solde'] },
];

export function actesDuContrat(d, scans) {
  const lots = new Set([d.code_lot, ...(d.lots_rattaches || []).map((r) => r.code_lot)].filter(Boolean));
  return scans.flatMap((doc) => ((doc.champs && doc.champs.actes) || [])
    .filter((a) => !a.hors_dossier
      && (!doc.code_lot || lots.has(doc.code_lot) || (a.lots || []).some((l) => lots.has(l))))
    .map((a) => ({ ...a, document_id: a.document_id || doc.id })))
    .sort((x, y) => String(x.date || '9999').localeCompare(String(y.date || '9999')));
}

export function acteDetail(a) {
  if (a.type === 'avenant') return `lot ${esc(a.lot_avant || '—')} ➔ ${esc(a.lot_apres || '—')}`;
  if (a.nouveau_titulaire) return `${esc(a.ancien_titulaire || '—')} ➔ <strong>${esc(a.nouveau_titulaire)}</strong>`;
  if (a.titulaire) return esc(a.titulaire) + (a.mandataire ? ' (mandataire ' + esc(a.mandataire) + ')' : '');
  return (a.lots || []).length ? 'lot ' + esc(a.lots.join(', ')) : '';
}

export const lienActe = (a) => `<button type="button" class="cl-page" data-voir-doc="${num(a.document_id)}" data-page="${num(a.page)}"
  title="Ouvrir le PDF scanné à cette page">${a.date ? esc(dateFr(a.date)) + ' · ' : ''}p. ${num(a.page)}</button>`;

export function statutSuivi(v) {
  if (!v) return '<span class="aide">non renseigné</span>';
  if (SUIVI_OUI.test(v.trim())) return `<span class="cl-badge succes">${esc(v)}</span>`;
  return `<span class="cl-badge ${SUIVI_NON.test(v.trim()) ? 'doux' : 'vigilance'}">${esc(v)}</span>`;
}

export function actesHTML(d, scans) {
  const actes = actesDuContrat(d, scans);
  const suivi = d.suivi || [];
  if (!actes.length && !suivi.length) return '';
  const libelles = (APP.clients && APP.clients.ACTES) || {};
  const plusieursLots = suivi.length > 1;
  // tout acte hors des trois catégories du classeur (procuration, désistement, mise en demeure, transfert de propriété…) :
  // une ligne « Autres actes », sans colonne du classeur
  const connus = new Set(CATEGORIES_ACTES.flatMap((c) => c.types));
  const categories = [...CATEGORIES_ACTES, { titre: 'Autres actes', suivi: null, types: [...new Set(actes.filter((a) => !connus.has(a.type)).map((a) => a.type))] }]
    .filter((c) => c.suivi || c.types.length);
  const lignes = categories.map((c) => {
    const lus = actes.filter((a) => c.types.includes(a.type));
    const valeurs = c.suivi ? suivi.map((s) => s[c.suivi]) : [];
    const auClasseur = valeurs.some((v) => v && SUIVI_OUI.test(v.trim()));
    const constat = !c.suivi ? '<span class="aide">—</span>' : lus.length && suivi.length && !auClasseur
      ? '<span class="cl-badge alerte" title="Pièce lue dans le scan mais pas reportée au classeur commercial">À reporter au classeur</span>'
      : (!lus.length && auClasseur
        ? '<span class="cl-badge vigilance" title="Le classeur l’indique mais aucune page de ce type n’a été reconnue dans les scans">Pièce non retrouvée au scan</span>'
        : (lus.length && auClasseur ? '<span class="cl-badge succes">Concordant</span>' : '<span class="aide">—</span>'));
    return `<tr>
      <th scope="row">${esc(c.titre)}</th>
      <td data-libelle="Classeur commercial">${!c.suivi ? '<span class="aide">non suivi au classeur</span>' : suivi.length ? suivi.map((s) => (plusieursLots ? `<span class="aide">lot ${esc(s.code_lot)}</span> ` : '') + statutSuivi(s[c.suivi])).join('<br>') : '<span class="aide">hors classeur</span>'}</td>
      <td data-libelle="Lu dans les scans">${lus.length ? lus.map((a) => `<div class="do-acte">${c.types.length > 1 ? `<span>${esc(libelles[a.type] || a.type)}</span> ` : ''}${acteDetail(a) ? `<span class="aide">${acteDetail(a)}</span> ` : ''}${lienActe(a)}</div>`).join('') : '<span class="aide">aucune page reconnue</span>'}</td>
      <td data-libelle="Constat">${constat}</td>
    </tr>`;
  }).join('');
  const commentaires = suivi.filter((s) => s.commentaire);
  return `<div class="bloc do-actes">
    <h3 class="titre-section"><span>Actes et attestations</span></h3>
    <p class="aide">Relevés dans les PDF scannés et comparés au suivi administratif du classeur commercial.</p>
    <div class="cl-table do-table do-table-actes"><table>
      <caption class="visuellement-cache">Actes et attestations du contrat</caption>
      <thead><tr><th scope="col">Pièce</th><th scope="col">Classeur commercial</th><th scope="col">Lu dans les scans</th><th scope="col">Constat</th></tr></thead>
      <tbody>${lignes}</tbody>
    </table></div>
    ${commentaires.map((s) => `<p class="aide">Commentaire du classeur${plusieursLots ? ' (lot ' + esc(s.code_lot) + ')' : ''} : ${esc(s.commentaire)}</p>`).join('')}
    ${actes.length ? `<details class="do-chrono-actes"><summary>Tous les actes du dossier, dans l’ordre du temps (${num(actes.length)})</summary>
      <ol>${actes.map((a) => `<li>${esc(libelles[a.type] || a.type)}${acteDetail(a) ? ' : ' + acteDetail(a) : ''} ${lienActe(a)}</li>`).join('')}</ol>
    </details>` : ''}
  </div>`;
}

// ---------- conditions du contrat de réservation-vente ----------
// Lues dans les pages « contrat » des PDF scannés (champs.conditions_contrat, etl/import_dossiers_ocr.py
// conditions_contrat) : prix, apport, appels de fonds par étape ou mensualités, livraison prévue, dédit.
export function conditionsDuContrat(d, scans) {
  const lots = new Set([d.code_lot, ...(d.lots_rattaches || []).map((r) => r.code_lot)].filter(Boolean));
  const avec = scans.filter((doc) => doc.champs && doc.champs.conditions_contrat);
  const doc = avec.find((x) => x.code_lot && lots.has(x.code_lot)) || avec.find((x) => !x.code_lot) || (lots.size ? null : avec[0]);
  return doc ? { ...doc.champs.conditions_contrat, document_id: doc.id } : null;
}

export const lienContrat = (c, champ) => (c.pages && c.pages[champ]
  ? ` <button type="button" class="cl-page" data-voir-doc="${num(c.document_id)}" data-page="${num(c.pages[champ])}" title="Ouvrir le contrat scanné à cette page">p. ${num(c.pages[champ])}</button>`
  : '');

export function livraisonHTML(c, travaux) {
  const l = c.livraison;
  const livree = travaux && /^LIVREE/.test(travaux.etat || '');
  let constat = '';
  if (livree) {
    constat = `<span class="cl-badge succes">${travaux.etat === 'LIVREE_SOUS_RESERVE' ? 'Livrée sous réserve' : 'Livrée'}</span>`;
  } else if (l.date) {
    const ecart = moisEntre(new Date(l.date), new Date());
    constat = ecart > 0
      ? `<span class="cl-badge alerte" title="Date prévue au contrat dépassée, villa non livrée">Dépassée de ${pl(ecart, 'mois', 'mois')}</span>`
      : `<span class="cl-badge doux">${ecart === 0 ? 'Ce mois-ci' : 'Dans ' + pl(-ecart, 'mois', 'mois')}</span>`;
    if (travaux && travaux.taux_execution != null) constat += ` <span class="aide">avancement ${num(Math.round(travaux.taux_execution * 100))} %</span>`;
  }
  return `${esc(l.texte)}${l.date ? ` <span class="aide">(au plus tard le ${esc(dateFr(l.date))})</span>` : ''} ${constat}${lienContrat(c, 'livraison')}`;
}

// Appels de fonds par étape : couverts dans l'ordre par le total versé (apport d'abord).
export function echeancierContratHTML(c, verse) {
  let cumul = c.apport || 0;
  const lignes = c.echeancier.map((e) => {
    const avant = cumul;
    cumul += e.montant || 0;
    const etat = verse >= cumul - 1000 ? ['payee', 'Couvert']
      // « non réglé » n'est pas un retard : l'appel n'est exigible qu'une fois l'étape réalisée et la lettre reçue
      : (verse > avant ? ['avenir', 'Partiel · ' + fcfa(verse - avant)] : ['avenir', 'Non réglé']);
    return `<tr class="do-ech-${etat[0]}"><td>${esc(e.etape)}</td><td class="n">${num(e.pct)} %</td>
      <td class="n">${esc(fcfa(e.montant))}</td><td class="n">${esc(fcfa(cumul))}</td>
      <td><span class="do-etat ${etat[0]}">${esc(etat[1])}</span></td></tr>`;
  }).join('');
  return `<div class="cl-table do-table"><table>
    <caption class="visuellement-cache">Appels de fonds prévus au contrat</caption>
    <thead><tr><th>Appel de fonds à la réalisation de…</th><th class="n">Part du solde</th><th class="n">Montant</th>
      <th class="n">Cumul avec l’apport</th><th>Versements</th></tr></thead>
    <tbody>${lignes}</tbody></table></div>`;
}

export function mensualiteHTML(m) {
  return `${pl(m.nombre, 'mensualité', 'mensualités')} de <strong>${esc(fcfa(m.montant))}</strong>`
    + (m.debut ? ` à partir de ${esc(m.debut)}` : '') + ` <span class="aide">(${m.objet === 'apport' ? 'reliquat d’apport' : 'solde'})</span>`;
}

export function conditionsHTML(d, scans) {
  const c = conditionsDuContrat(d, scans);
  if (!c) return '';
  const verse = Number(d.total_verse) || 0;
  const prixFichier = Number(d.prix_vente) || 0;
  const ecartPrix = c.prix && prixFichier && Math.abs(c.prix - prixFichier) > Math.max(1000, 0.01 * prixFichier);
  const de = c.dedit || {};
  const lignes = [];
  if (c.prix) {
    lignes.push(['Prix au contrat', `<strong>${esc(fcfa(c.prix))}</strong> HT ${prixFichier
      ? (ecartPrix ? `<span class="cl-badge vigilance" title="Prix du dossier commercial différent : avenant, remise ou erreur de saisie">Dossier : ${esc(fcfa(prixFichier))}</span>`
        : '<span class="cl-badge succes">= dossier</span>') : ''}${lienContrat(c, 'prix')}`]);
  }
  if (c.comptant) lignes.push(['Paiement', '<span class="cl-badge succes">Prix intégral à la signature</span>']);
  if (c.apport) lignes.push(['Apport à la signature', `${esc(fcfa(c.apport))}${c.apport_modalites ? ` <span class="aide">${esc(c.apport_modalites)}</span>` : ''}${lienContrat(c, 'apport')}`]);
  if (c.solde) lignes.push(['Solde', `${esc(fcfa(c.solde))}${c.solde_modalites && !c.echeancier ? ` <span class="aide">${esc(c.solde_modalites)}</span>` : ''}${lienContrat(c, 'solde')}`]);
  (c.mensualites || []).forEach((m) => lignes.push(['Mensualités', mensualiteHTML(m) + lienContrat(c, 'mensualites')]));
  if (c.location_vente) lignes.push(['Location-vente', `Solde réglé en location-vente${c.taux_interet ? ` · intérêt ${num(c.taux_interet)} %` : ''}`]);
  if (c.livraison) lignes.push(['Livraison prévue', livraisonHTML(c, d.travaux)]);
  if (c.delai_paiement_jours) lignes.push(['Délai de paiement', `${pl(c.delai_paiement_jours, 'jour', 'jours')} après l’appel de fonds${lienContrat(c, 'delai_paiement_jours')}`]);
  if (c.resiliation) lignes.push(['Résiliation par le réservant', esc(c.resiliation)]);
  if (c.retractation_jours) lignes.push(['Rétractation', `${pl(c.retractation_jours, 'jour ouvré', 'jours ouvrés')} après la signature`]);
  if (de.jours || de.retenue_pct) {
    const avant = de.jours ? `Dans les ${pl(de.jours, 'jour', 'jours')} : tout est restitué${de.frais_dossier ? ` sauf les frais de dossier (${esc(fcfa(de.frais_dossier))})` : ''}.` : '';
    const apres = de.retenue_pct ? ` Ensuite : retenue de ${num(de.retenue_pct)} % ${de.retenue_base === 'chiffre d\'affaires' ? 'sur le chiffre d’affaires' : 'des sommes perçues'}${de.restitution_jours ? `, reste restitué sous ${pl(de.restitution_jours, 'jour', 'jours')}` : ''}.` : '';
    // estimation seulement quand la retenue porte sur les sommes perçues : « chiffre d'affaires » est ambigu
    const estimation = de.retenue_pct && de.retenue_base !== 'chiffre d\'affaires' && verse
      ? `<br><span class="aide">Désistement aujourd’hui : retenue ${esc(fcfa(verse * de.retenue_pct / 100))}, à restituer ≈ <strong>${esc(fcfa(verse * (1 - de.retenue_pct / 100)))}</strong> sur ${esc(fcfa(verse))} versés.</span>` : '';
    lignes.push(['Dédit (désistement)', `${avant}${apres}${lienContrat(c, 'dedit')}${estimation}`]);
  }
  if (c.reevaluation) lignes.push(['Révision du prix', '<span class="aide">Prévue au contrat (travaux complémentaires, indice BCOP)</span>']);
  return `<div class="bloc do-conditions">
    <h3 class="titre-section"><span>Conditions du contrat</span></h3>
    <p class="aide">Lues dans le contrat de réservation-vente scanné : à vérifier sur la page source avant toute relance ou restitution.</p>
    <dl class="fiche-dl do-dl do-dl-conditions">${lignes.map(([t, v]) => `<dt>${esc(t)}</dt><dd>${v}</dd>`).join('')}</dl>
    ${c.echeancier ? `<div class="do-sous-titre-bloc"><h4>Appels de fonds prévus au contrat${lienContrat(c, 'echeancier')}</h4>
      <button type="button" class="bouton secondaire petit" data-gen-doc="appel_de_fonds">Préparer l’appel de fonds</button></div>
      ${echeancierContratHTML(c, verse)}` : ''}
  </div>`;
}

// Synthèse de la fiche client : l'essentiel des conditions, le détail est dans « Actes & conditions ».
export function conditionsResumeHTML(c, d) {
  if (!c) return '';
  const prixDossier = Number(d.prix_vente) || 0;
  const modalites = c.comptant ? 'Prix intégral à la signature'
    : (c.echeancier ? `Apport ${fcfa(c.apport)}, puis ${pl(c.echeancier.length, 'appel de fonds', 'appels de fonds')} par étape de travaux`
      : ((c.mensualites || []).map((m) => `${pl(m.nombre, 'mensualité', 'mensualités')} de ${fcfa(m.montant)}`).join(' puis ') || ''));
  const lignes = [
    c.prix ? ['Prix au contrat', `${esc(fcfa(c.prix))}${prixDossier && Math.abs(c.prix - prixDossier) > Math.max(1000, 0.01 * prixDossier)
      ? ` <span class="cl-badge vigilance">dossier : ${esc(fcfa(prixDossier))}</span>` : ''}`] : null,
    modalites ? ['Règlement prévu', esc(modalites)] : null,
    c.livraison ? ['Livraison prévue', livraisonHTML(c, d.travaux)] : null,
    c.dedit && c.dedit.retenue_pct ? ['Dédit', `retenue de ${num(c.dedit.retenue_pct)} % après ${pl(c.dedit.jours || 7, 'jour', 'jours')}`] : null,
  ].filter(Boolean);
  if (!lignes.length) return '';
  return `<div class="bloc do-conditions">
    <h3 class="titre-section"><span>Contrat signé</span></h3>
    <dl class="fiche-dl do-dl do-dl-conditions">${lignes.map(([t, v]) => `<dt>${esc(t)}</dt><dd>${v}</dd>`).join('')}</dl>
    <button type="button" class="lien" data-aller-onglet="actes">Toutes les conditions du contrat</button>
  </div>`;
}

// ---------- pièces d'identité relevées dans les scans (backend/sig/identites.py) ----------
// Un dossier peut en citer plusieurs : renouvellement, passeport puis carte, co-titulaire, cédant et cessionnaire.
const numeroNorm = (n) => String(n || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

export function identitesHTML(d) {
  const pieces = d.pieces_identite || [];
  const a = d.acquereur || {};
  const fiche = numeroNorm(a.piece_numero);
  const surFiche = (p) => fiche && [p.numero, p.nin].some((n) => n && numeroNorm(n) === fiche);
  if (!pieces.length && !fiche) return '';
  const ficheRetrouvee = !fiche || pieces.some(surFiche);
  return `<div class="bloc do-identites">
    <h3 class="titre-section"><span>Pièces d’identité</span></h3>
    <p class="aide">Relevées dans les PDF scannés : copies de pièces (zone de lecture, numéro imprimé) et numéros cités dans les actes.
      Fiche client : <strong>${esc([a.piece_type, a.piece_numero].filter(Boolean).join(' ') || 'aucune pièce saisie')}</strong>.</p>
    ${pieces.length > 1 ? `<p class="note" role="note">${pl(pieces.length, 'pièce différente relevée', 'pièces différentes relevées')} :
      pièce renouvelée, co-titulaire, ou changement de titulaire. Vérifiez celle qui vaut pour le contrat.</p>` : ''}
    ${!ficheRetrouvee ? '<p class="note" role="note">La pièce saisie sur la fiche client n’est citée dans aucun scan lu.</p>' : ''}
    ${pieces.length ? `<ul class="do-liste-identites">${pieces.map((p) => `<li>
      <div class="do-identite-tete">
        <strong>${esc(p.type)}${p.pays ? ' · ' + esc(p.pays) : ''}</strong>
        <span class="do-identite-num">N° ${esc(p.numero)}</span>
        ${p.nin ? `<span class="aide">NIN ${esc(p.nin)}</span>` : ''}
        ${surFiche(p) ? '<span class="cl-badge succes">sur la fiche client</span>' : ''}
      </div>
      <div class="do-acte">
        ${p.nom ? `<span>${esc(p.nom)}</span>` : '<span class="aide">titulaire non lu</span>'}
        <span class="aide">· ${esc(p.origines.join(', '))}</span>
        ${p.pages.map((x) => `<button type="button" class="cl-page" data-voir-doc="${num(x.document_id)}" data-page="${num(x.page)}"
          title="Ouvrir le PDF scanné à cette page">p. ${num(x.page)}</button>`).join('')}
      </div>
    </li>`).join('')}</ul>` : '<p class="aide">Aucun numéro de pièce lu dans les scans.</p>'}
  </div>`;
}

export function dossiersScannes(liste, deplacer) {
  if (!liste.length) return '<p class="vide">Aucun dossier scanné rattaché à cet acquéreur.</p>';
  const nomsPieces = (APP.clients && APP.clients.PIECES) || {};
  return `<div class="do-scans">${liste.map((d) => {
    const groupes = new Map();
    (d.pages || []).forEach((p) => (groupes.get(p.type_piece) || groupes.set(p.type_piece, []).get(p.type_piece)).push(p.page));
    return `<article class="do-scan">
      <div class="do-scan-tete">
        <div>
          <strong>${esc(d.categorie === 'contentieux' ? 'Dossier contentieux' : 'Dossier client')}${d.code_lot ? ' · lot ' + esc(d.code_lot) : ''}</strong>
          <span class="aide">${num(d.pages_lues || 0)} / ${num(d.nb_pages || 0)} pages lues</span>
        </div>
        <div class="do-scan-actions">
          <button type="button" class="bouton secondaire micro" data-voir-doc="${num(d.id)}" data-page="1">Ouvrir le PDF</button>
          ${deplacer ? `<button type="button" class="bouton secondaire micro" data-deplacer-scan="${num(d.id)}">Déplacer…</button>` : ''}
        </div>
      </div>
      <div class="do-scan-pages">
        ${[...groupes].map(([type, pages]) => `<div class="do-scan-groupe"><span>${esc(nomsPieces[type] || type)}</span>
          <div>${pages.map((page) => `<button type="button" class="cl-page" data-voir-doc="${num(d.id)}" data-page="${num(page)}">p. ${num(page)}</button>`).join('')}</div></div>`).join('')}
      </div>
    </article>`;
  }).join('')}</div>`;
}

// ---------- ventilation d'un règlement commun entre les villas ----------
// Partagée avec la fiche client (APP.dossiers.ventilationHTML). Le versé de chaque villa est au prorata des parts.
export const ICONES = { ok: '✓', alerte: '⚠', info: 'ℹ' };
export function ventilationHTML(v, peutModifier, dossierCourant) {
  const ligne = (x) => `<tr${x.id === dossierCourant ? ' class="vt-courant"' : ''}>
      <th scope="row">Lot <a href="#dossiers/id=${x.id}">${esc(x.code_lot || '—')}</a>${x.principal ? ' <small>dossier principal</small>' : ' <small>rattaché</small>'}</th>
      <td>${esc(x.type_villa || '—')}</td><td class="vt-n">${esc(fcfa(x.part_prix))}</td>
      <td class="vt-n">${esc(fcfa(x.verse))}</td><td class="vt-n">${esc(fcfa(x.reste))}</td>
      <td>${peutModifier && !x.principal && x.statut_dossier === 'actif' ? `<button type="button" class="bouton secondaire micro" data-part="${x.id}" data-part-valeur="${x.part_prix}" data-part-lot="${esc(x.code_lot || '')}">Modifier la part</button>` : ''}</td></tr>`;
  return `<h3 class="titre-section"><span>Ventilation par villa</span></h3>
    <p class="aide">Un seul règlement pour ${v.lots.length} villas : le prix et les versements sont portés par le dossier principal ; le versé de chaque villa est calculé au prorata de sa part du prix.</p>
    <div class="vt-defile"><table class="vt-table">
      <thead><tr><th scope="col">Villa</th><th scope="col">Type</th><th scope="col">Part du prix</th><th scope="col">Versé</th><th scope="col">Reste</th><th scope="col"><span class="visuellement-cache">Action</span></th></tr></thead>
      <tbody>${v.lots.map(ligne).join('')}</tbody>
      <tfoot><tr><th scope="row" colspan="2">Total</th><td class="vt-n">${esc(fcfa(v.prix_total))}</td><td class="vt-n">${esc(fcfa(v.verse_total))}</td><td class="vt-n">${esc(fcfa(v.reste_total))}</td><td></td></tr></tfoot>
    </table></div>
    <h4 class="vt-titre">Conformité des sommes et des types de villa</h4>
    <ul class="vt-conf">${(v.conformite || []).map((c) => `<li class="vt-${esc(c.niveau)}"><span aria-hidden="true">${ICONES[c.niveau] || '•'}</span><span>${esc(c.texte)}</span></li>`).join('')}</ul>`;
}
