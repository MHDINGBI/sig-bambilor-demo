// Dossiers — Fiche d'un dossier : sections, sous-onglets (fiche client) et écouteurs.
import {
  actesHTML, cible, conditionsDuContrat, conditionsHTML, conditionsResumeHTML, dateFr, dessinerJauge, dossiersScannes,
  etat, fcfa, identitesHTML, listePieces, peutChangerLot, peutEcrire, tableEcheances, tableVersements,
  tableVersementsProposes, tuile, ventilationHTML,
} from './commun.js';
import { ouvrirDocument, envoyerPiece } from './documents.js';
import { ouvrirVersement, ouvrirAnnulation, ouvrirDesistement } from './versements.js';
import { detacherLot, ouvrirDeplacement, ouvrirPart, ouvrirRattachement, ouvrirReaffectation } from './lots.js';
const { $, esc, num, pl } = APP;

export async function chargerDetail(id) {
  cible().hidden = false;
  cible().innerHTML = '<p class="vide">Chargement du dossier…</p>';
  try {
    etat.detail = await SIG.api('/api/dossiers/' + encodeURIComponent(id) + '/');
    afficherDetail();
  } catch (e) {
    etat.detail = null;
    cible().innerHTML = `<p class="note erreur">Dossier indisponible : ${esc(e.message)}</p>`;
  }
}

export function afficherDetail() {
  const detail = etat.detail;
  const integre = !!etat.conteneurMonte;
  if (!integre) {
    $('do-vue').value = 'fiche';
    $('do-retour').hidden = false;
    if ($('do-copier') && detail) {
      $('do-copier').hidden = false;
      $('do-copier').dataset.lien = APP.lien('dossiers', detail.id);
    }
    $('do-nouveau').hidden = true;
  }
  cible().hidden = false;
  const d = detail, s = d.situation || {}, a = d.acquereur || {};
  // Les scans contentieux ne sont pas des dossiers du client : ils vivent dans Contentieux & Remboursements.
  const scans = (d.documents || []).filter((doc) => doc.categorie !== 'contentieux');
  const nbContentieux = (d.documents || []).length - scans.length;
  const ecrit = peutEcrire();
  const changeLot = peutChangerLot();
  const rattache = !!d.dossier_principal_id;   // lot rattaché : ni prix, ni échéancier, ni versement propres
  const lots = d.lots_rattaches || [];
  const paye = d.prix_vente ? Math.min(1, (d.total_verse || 0) / d.prix_vente) : 0;

  const notesRattache = [
    rattache && d.principal ? `<p class="do-rattache" role="note"><span class="do-badge">Lot rattaché</span>
            Le prix, l’échéancier et les versements sont portés par ${integre ? 'le lot principal' : 'le dossier'}
            ${integre ? `<button type="button" class="lien" data-lot-contrat="${esc(d.principal.id)}">lot ${esc(d.principal.code_lot || '—')}</button>` : `<a href="#dossiers/id=${esc(d.principal.id)}">${esc(d.principal.numero_dossier || '#' + d.principal.id)} · lot ${esc(d.principal.code_lot || '—')}</a>`}
            — le règlement couvre les deux villas.</p>` : '',
    lots.length ? `<p class="do-rattache" role="note"><span class="do-badge">${pl(lots.length, 'lot rattaché', 'lots rattachés')}</span>
            ${integre ? 'Ce contrat couvre aussi' : 'Ce dossier règle aussi'} : ${lots.map((r) => integre ? `<button type="button" class="lien" data-lot-contrat="${esc(r.id)}">lot ${esc(r.code_lot || '—')}</button>` : `<a href="#dossiers/id=${esc(r.id)}">lot ${esc(r.code_lot || '—')}</a>`).join(', ')}.</p>` : '',
  ].join('');
  // Sections du détail. Dans la fiche client (intégré), elles passent en sous-onglets : une seule visible à la
  // fois, pour ne pas faire défiler tout le dossier sous la liste des contrats. Page Dossiers : l'une sous l'autre.
  const conditions = conditionsDuContrat(d, scans);
  // Fiche client : une seule barre d'actions, sur la ligne des sous-onglets. L'action courante en bouton,
  // les documents et les actions rares (changer de lot, désistement) en menus. L'export Excel porte sur
  // l'acquéreur : il reste dans l'en-tête de la fiche.
  // Actions du contrat, en boutons-icônes (libellé en info-bulle et pour les lecteurs d'écran). Les documents
  // (réservation, appel, relevé) et le désistement sont en haut de la fiche client, avec l'acquéreur.
  const P = {
    fiche: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    appel: '<path d="M4 4h16v16l-3-2-3 2-2-2-2 2-3-2-3 2z"/><path d="M8 9h8M8 13h5"/>',
    releve: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    lot: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
    lier: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    delier: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1M4 4l16 16"/>',
    desist: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  };
  const btn = (cle, libelle, { id = '', data = '', classe = '', titre, court } = {}) =>
    `<button type="button"${id ? ` id="${id}"` : ''} class="bouton secondaire petit do-icone ${classe}" ${data} title="${esc(titre || libelle)}" aria-label="${esc(libelle)}">`
    + `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[cle]}</svg><span class="do-icone-txt">${esc(court || libelle)}</span></button>`;
  const groupeActions = [
    changeLot ? btn('lot', d.code_lot ? 'Changer de lot' : 'Affecter un lot', { id: 'do-reaffecter', court: d.code_lot ? 'Lot' : 'Affecter' }) : '',
    changeLot && !rattache && d.statut_dossier === 'actif' ? btn('lier', 'Rattacher un lot', { id: 'do-rattacher', court: 'Rattacher', titre: 'Rattacher un lot : même acquéreur, même règlement, sans prix ni échéancier pour le second lot' }) : '',
    changeLot && rattache ? btn('delier', 'Détacher ce lot', { id: 'do-detacher', court: 'Détacher', titre: 'Détacher ce lot : annuler le rattachement (erreur de saisie)' }) : '',
  ].join('');
  const actionsContrat = `<div class="do-actions-contrat" role="group" aria-label="Actions sur le contrat">
    ${ecrit && !rattache ? '<button type="button" id="do-versement" class="bouton petit">Enregistrer un versement</button>' : ''}
    ${groupeActions ? `<span class="do-actions-groupe" role="group" aria-label="Autres actions">${groupeActions}</span>` : ''}
  </div>`;
  const sections = {
    synthese: { titre: 'Synthèse', html: `
      <div class="tuiles do-tuiles">
        ${tuile('Dû à date', fcfa(s.total_du_a_date), 'échéances arrivées à terme')}
        ${tuile('Versé', fcfa(s.total_verse != null ? s.total_verse : d.total_verse), 'versements non annulés')}
        ${tuile('En retard', fcfa(s.en_retard), s.retard_jours ? num(s.retard_jours) + ' jours' : 'à jour', (s.en_retard || 0) > 0)}
        ${tuile('Reste à payer', fcfa(s.reste_a_payer != null ? s.reste_a_payer : d.reliquat), esc(d.etat_compte || ''))}
      </div>
      ${d.ventilation ? `<div class="bloc">${ventilationHTML(d.ventilation, changeLot, d.id)}</div>` : ''}
      <div class="do-rangee">
        <div class="bloc">
          <h3 class="titre-section"><span>Paiement</span></h3>
          <div class="do-jauge" id="do-jauge"></div>
          <dl class="fiche-dl do-dl">
            <dt>Prix de vente</dt><dd${APP.ancre('champ', 'prix_vente', `Contrat ${d.numero_dossier || '#' + d.id} — Prix de vente`)}>${esc(fcfa(d.prix_vente))}</dd>
            <dt>Frais de dossier</dt><dd${APP.ancre('champ', 'frais_dossier', `Contrat ${d.numero_dossier || '#' + d.id} — Frais de dossier`)}>${esc(fcfa(d.frais_dossier))}</dd>
            ${integre ? '' : `<dt>Téléphone</dt><dd>${esc(a.telephone || '—')}</dd>
            <dt>E-mail</dt><dd>${esc(a.email || '—')}</dd>
            <dt>Pièce d’identité</dt><dd>${esc([a.piece_type, a.piece_numero].filter(Boolean).join(' ') || '—')}</dd>
            <dt>Adresse</dt><dd>${esc(a.adresse || '—')}</dd>`}
          </dl>
        </div>
        ${integre ? conditionsResumeHTML(conditions, d) : `<div class="bloc">
          <h3 class="titre-section"><span>Échéancier</span></h3>
          ${tableEcheances(d.echeances || [])}
        </div>`}
      </div>` },
    reglements: { titre: 'Échéancier & versements', compte: (d.versements || []).length, html: `
      ${integre ? `<div class="bloc">
        <h3 class="titre-section"><span>Échéancier</span></h3>
        ${tableEcheances(d.echeances || [])}
      </div>` : ''}
      ${d.versements_proposes && d.versements_proposes.length > 0 ? `
      <div class="bloc do-propositions-ocr">
        <div class="do-propositions-entete">
          <h3 class="titre-section"><span>Versements détectés par OCR à rapprocher</span> <span class="badge alerte">${d.versements_proposes.length}</span></h3>
          <p class="aide">Ces versements ont été extraits des bordereaux ou reçus numérisés mais ne sont pas encore comptabilisés dans le dossier.</p>
        </div>
        ${proposesParLot(d.versements_proposes, ecrit)}
      </div>` : ''}
      <div class="bloc">
        <h3 class="titre-section"><span>Versements</span></h3>
        ${tableVersements(d.versements || [], ecrit)}
      </div>`, alerte: (d.versements_proposes || []).length },
    commentaires: { titre: 'Commentaires', html: '<div id="do-commentaires" class="do-commentaires"></div>' },
    actes: { titre: 'Actes & conditions', html: `
      ${conditionsHTML(d, scans)}
      ${actesHTML(d, scans)}
      ${identitesHTML(d)}` },
    pieces: { titre: 'Pièces & scans', compte: (d.pieces || []).length + scans.length, html: `
      <div class="bloc">
        <h3 class="titre-section"><span>Pièces jointes</span></h3>
        ${listePieces(d.pieces || [])}
        ${ecrit ? `<label class="bouton secondaire do-ajout-piece">
          <input type="file" id="do-piece" accept="image/*,application/pdf"> Ajouter une pièce</label>` : ''}
      </div>
      <div class="bloc">
        <div class="do-section-entete">
          <h3 class="titre-section"><span>${integre ? pl(scans.length, 'PDF scanné', 'PDF scannés') : pl(scans.length, 'dossier scanné', 'dossiers scannés')}</span></h3>
          <span class="aide">${num(scans.reduce((t, doc) => t + (doc.nb_pages || 0), 0))} pages totales</span>
        </div>
        ${dossiersScannes(scans, changeLot)}
        ${nbContentieux ? `<p class="aide">Ce client a ${pl(nbContentieux, 'scan contentieux', 'scans contentieux')}, traité${nbContentieux > 1 ? 's' : ''} dans la page
          <a href="#contentieux/ref=${encodeURIComponent(d.acquereur_ref || '')}">Contentieux &amp; Remboursements</a>.</p>` : ''}
      </div>` },
  };

  cible().innerHTML = `
    <div class="do-fiche${integre ? ' do-integre' : ''}">
      ${integre ? (notesRattache ? `<div class="do-notes-contrat">${notesRattache}</div>` : '') : `
      <div class="bloc do-tete">
        <div>
          <span class="c-etiquette">${integre ? 'Contrat ' + esc(d.numero_dossier || '#' + d.id) + ' · Lot ' + esc(d.code_lot || '—') : 'Dossier ' + esc(d.numero_dossier || '')} · <span class="do-badge ${d.source === 'excel' ? 'excel' : 'saisi'}">${d.source === 'excel' ? 'Excel' : 'saisi'}</span></span>
          ${integre ? '' : `<h2 class="do-titre">
            <a href="#clients/ref=${esc(encodeURIComponent(d.acquereur_ref || ''))}" class="do-lien-acq" style="color:inherit;text-decoration:none;" title="Consulter la fiche client, ses documents et sa GED">
              👤 ${esc([a.civilite, a.prenoms, a.nom].filter(Boolean).join(' ') || d.acquereur_nom || '—')} <span style="font-size:0.875rem;opacity:0.7;">↗</span>
            </a>
          </h2>`}
          <p class="do-sous-titre">
            ${integre ? '' : `Lot ${d.code_lot ? `<a href="#carte/lot=${esc(encodeURIComponent(d.code_lot))}">${esc(d.code_lot)}</a>` : '<span class="do-badge alerte">Aucun lot affecté</span>'} · `}${esc(d.type_villa || '—')} · ${esc(d.code_phase || '—')}
            · ${esc(d.option_paiement || '—')} · réservé le ${dateFr(d.date_reservation)}
          </p>
          ${notesRattache}
        </div>
        <div class="do-tete-barre">
          <!-- Navigation : où aller. -->
          ${integre ? '' : `<div class="do-nav" role="group" aria-label="Navigation">
            <a href="#clients/ref=${esc(encodeURIComponent(d.acquereur_ref || ''))}" class="bouton" title="Ouvrir la fiche client et consulter ses pièces scannées">
              👤 Fiche client
            </a>
            ${d.code_lot ? `<a href="#carte/lot=${esc(encodeURIComponent(d.code_lot))}" class="bouton secondaire" title="Afficher le lot sur le plan cadastral">
              Voir sur le plan
            </a>` : ''}
          </div>`}
          <!-- Actions : ce qui modifie le dossier. -->
          <div class="do-actions" role="group" aria-label="Actions">
            ${ecrit && !rattache ? '<button type="button" id="do-versement" class="bouton">Enregistrer un versement</button>' : ''}
            ${changeLot ? `<button type="button" id="do-reaffecter" class="bouton secondaire">${d.code_lot ? 'Changer de lot' : 'Affecter un lot'}</button>` : ''}
            ${changeLot && !rattache && d.statut_dossier === 'actif' ? '<button type="button" id="do-rattacher" class="bouton secondaire" title="Même acquéreur, même règlement : sans prix ni échéancier pour le second lot">Rattacher un lot</button>' : ''}
            ${changeLot && rattache ? '<button type="button" id="do-detacher" class="bouton secondaire" title="Annuler le rattachement (erreur de saisie)">Détacher ce lot</button>' : ''}
            ${ecrit && !rattache ? '<button type="button" id="do-desistement" class="bouton secondaire">Désistement</button>' : ''}
            <button type="button" class="bouton secondaire" data-export-excel="${esc(d.acquereur_ref || '')}"
                    title="Exporter ce dossier au format du classeur commercial — le fichier produit est réimportable">
              Excel
            </button>
          </div>
          <!-- Documents produits à la demande. -->
          <div class="do-documents" role="group" aria-label="Documents">
            <button type="button" class="bouton secondaire" data-gen-doc="fiche_reservation">Fiche de réservation</button>
            <button type="button" class="bouton secondaire" data-gen-doc="appel_de_fonds">Appel de fonds</button>
            <button type="button" class="bouton secondaire" data-gen-doc="releve">Relevé</button>
          </div>
        </div>
      </div>`}
      <div id="do-msg-fiche"></div>
      ${integre ? sousOngletsHTML(sections, actionsContrat) : Object.values(sections).map((x) => x.html).join('')}
    </div>`;

  dessinerJauge(paye);
  // Présence collab v2 : seulement pour la fiche autonome (#dossiers/id=…) — intégrée dans la fiche
  // client, c'est celle-ci qui porte déjà la présence (type: 'client'), avec ce même conteneur.
  if (!integre) {
    APP.collab?.ouvrir({
      type: 'dossier', id: d.id, libelle: 'Dossier ' + (d.numero_dossier || '#' + d.id),
      conteneur: cible(), entete: cible().querySelector('.do-actions') || cible(),
    });
  }
  // Commentaires permanents du contrat (sa propre fiche, distincte de celle du client).
  const zoneCommentaires = cible().querySelector('#do-commentaires');
  if (zoneCommentaires) {
    APP.collab?.montrerPermanents(zoneCommentaires, { cible: { type: 'dossier', id: String(d.id) }, surCompte: (n) => {
      const b = cible().querySelector('[data-sous-onglet="commentaires"]');
      let c = b && b.querySelector('.do-compte');
      if (b && !c) { c = document.createElement('span'); c.className = 'do-compte'; b.append(' ', c); }
      if (c) { c.textContent = String(n); c.hidden = !n; }
    } });
  }
  cible().querySelectorAll('[data-sous-onglet]').forEach((b) => {
    b.addEventListener('click', () => choisirSousOnglet(b.dataset.sousOnglet));
    b.addEventListener('keydown', (e) => {  // flèches gauche/droite entre onglets (motif ARIA tabs)
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tous = [...cible().querySelectorAll('[data-sous-onglet]')];
      const i = (tous.indexOf(b) + (e.key === 'ArrowRight' ? 1 : -1) + tous.length) % tous.length;
      choisirSousOnglet(tous[i].dataset.sousOnglet, true);
    });
  });
  cible().querySelectorAll('[data-aller-onglet]').forEach((b) =>
    b.addEventListener('click', () => choisirSousOnglet(b.dataset.allerOnglet, true)));
  cible().querySelectorAll('[data-gen-doc]').forEach((b) =>
    b.addEventListener('click', () => ouvrirDocument(b.dataset.genDoc, etat.detail.id, b.textContent)));
  cible().querySelectorAll('[data-recu]').forEach((b) =>
    b.addEventListener('click', () => ouvrirDocument('recu', Number(b.dataset.recu), 'Reçu')));
  cible().querySelectorAll('[data-annuler]').forEach((b) =>
    b.addEventListener('click', () => ouvrirAnnulation(Number(b.dataset.annuler), b.dataset.recuNumero)));
  cible().querySelectorAll('[data-voir-doc]').forEach((b) =>
    b.addEventListener('click', () => {
      if (APP.clients && APP.clients.ouvrirPage) {
        APP.clients.ouvrirPage(Number(b.dataset.voirDoc), Number(b.dataset.page || 1));
      }
    }));
  cible().querySelectorAll('[data-pre-saisir]').forEach((b) => {
    const idx = Number(b.dataset.preSaisir);
    const v = (etat.detail.versements_proposes || [])[idx];
    if (v) {
      b.addEventListener('click', () => ouvrirVersement({
        date_versement: v.date_versement,
        montant: v.montant,
        reference: v.numero || v.nom_fichier || '',
        nature: v.nature || 'apport',
        mode: 'versement_banque'
      }));
    }
  });
  if (integre) majBoutonsEntete(d, ecrit, rattache);
  $('do-versement')?.addEventListener('click', () => ouvrirVersement());
  $('do-reaffecter')?.addEventListener('click', () => ouvrirReaffectation());
  $('do-rattacher')?.addEventListener('click', () => ouvrirRattachement());
  cible().querySelectorAll('[data-deplacer-scan]').forEach((b) =>
    b.addEventListener('click', () => ouvrirDeplacement(Number(b.dataset.deplacerScan))));
  cible().querySelectorAll('[data-part]').forEach((b) =>
    b.addEventListener('click', () => ouvrirPart(Number(b.dataset.part))));
  $('do-detacher')?.addEventListener('click', detacherLot);
  $('do-desistement')?.addEventListener('click', ouvrirDesistement);
  $('do-piece')?.addEventListener('change', envoyerPiece);
  cible().addEventListener('collab:reveler-ancre', revelerAncre);
}

// Le désistement se lance depuis l'en-tête de la fiche client (clients/fiche.js) : le bouton n'est actif que si
// le contrat monté est un dossier actif, non rattaché, et si l'utilisateur peut écrire.
function majBoutonsEntete(d, ecrit, rattache) {
  const b = document.querySelector('[data-contrat-desistement]');
  if (!b) return;
  const raison = !ecrit ? 'Réservé au rôle commercial'
    : rattache ? 'Lot rattaché : le désistement se fait sur le dossier principal'
      : d.statut_dossier !== 'actif' ? 'Ce contrat est déjà clos' : '';
  b.disabled = !!raison;
  b.title = raison || 'Enregistrer le désistement : le lot est libéré et la demande de remboursement s’ouvre';
}

// Sous-onglets du détail dans la fiche client. Le sous-onglet choisi est gardé d'un contrat à l'autre.
// Bordereaux à rapprocher : un tableau par lot dès que le contrat en couvre plusieurs (les lots sans lecture à part).
function proposesParLot(liste, ecrit) {
  const lots = [...new Set(liste.map((v) => v.code_lot || ''))];
  if (lots.length < 2) return tableVersementsProposes(liste, ecrit);
  return lots.sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'fr', { numeric: true })).map((l) => {
    const sous = liste.filter((v) => (v.code_lot || '') === l);
    return `<h4 class="vt-titre">${l ? 'Lot ' + esc(l) : 'Lot non identifié'} <span class="aide">${pl(sous.length, 'bordereau', 'bordereaux')}</span></h4>
      ${tableVersementsProposes(sous, ecrit, liste)}`;
  }).join('');
}

function sousOngletsHTML(sections, actions) {
  if (!sections[etat.sousOngletActif]) etat.sousOngletActif = 'synthese';
  const cles = Object.keys(sections);
  return `<div class="do-sous-barre"><div class="do-sous-onglets" role="tablist" aria-label="Détail du contrat">
    ${cles.map((k) => `<button type="button" role="tab" id="do-so-${k}" class="do-sous-onglet" data-sous-onglet="${k}"
      aria-selected="${k === etat.sousOngletActif}" aria-controls="do-sp-${k}" tabindex="${k === etat.sousOngletActif ? 0 : -1}">
      ${esc(sections[k].titre)}${sections[k].compte ? ` <span class="do-compte">${num(sections[k].compte)}</span>` : ''}${sections[k].alerte ? ` <span class="badge alerte" title="Versements lus par OCR à rapprocher">${num(sections[k].alerte)}</span>` : ''}
    </button>`).join('')}
  </div>${actions || ''}</div>
  ${cles.map((k) => `<div role="tabpanel" id="do-sp-${k}" class="do-sous-panneau" aria-labelledby="do-so-${k}"${k === etat.sousOngletActif ? '' : ' hidden'}>${sections[k].html}</div>`).join('')}`;
}

function choisirSousOnglet(k, focus) {
  const onglet = cible().querySelector(`[data-sous-onglet="${k}"]`);
  if (!onglet) return;
  etat.sousOngletActif = k;
  cible().querySelectorAll('[data-sous-onglet]').forEach((b) => {
    const actif = b === onglet;
    b.setAttribute('aria-selected', String(actif));
    b.tabIndex = actif ? 0 : -1;
  });
  cible().querySelectorAll('.do-sous-panneau').forEach((p) => { p.hidden = p.id !== 'do-sp-' + k; });
  if (focus) onglet.focus();
}

function revelerAncre(e) {
  const p = e.target.closest('[id^="do-sp-"]');
  if (p) choisirSousOnglet(p.id.slice('do-sp-'.length));
}
