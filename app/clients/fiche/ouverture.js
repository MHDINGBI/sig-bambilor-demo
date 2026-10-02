// Fiche client : ouverture, fermeture et assemblage de la fiche 360° plein écran.
import { estFrais, NOTES_AFFECTATION } from '../commun.js';
import { alertes, fcfa, getRoleActif, libelleRole, profil, rapprochementLot, tuile } from './commun.js';
import { avisContentieuxHTML, dossiersCartes } from './contrats.js';
import { versementsParContrat } from './versements.js';
import { conformiteBoxHTML, ocrBoxHTML, pieces } from './scans.js';
import { desistementsCardHTML, remboursementsCardHTML } from './remboursements.js';
import { origineProfil, profilCardHTML, valeursProfil } from './profil.js';
const { $, esc, num } = APP;

// Icônes des boutons de l'en-tête (trait 2, héritent la couleur du texte).
const ICONES = {
  reservation: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  appel: '<path d="M4 4h16v16l-3-2-3 2-2-2-2 2-3-2-3 2z"/><path d="M8 9h8M8 13h5"/>',
  releve: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  desistement: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  ocr: '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 9h8M8 12h8M8 15h5"/>',
  remboursement: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v8M9 10h5M9 14h5"/>',
  plan: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
};
const ico = (cle) => `<svg class="cl-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[cle]}</svg>`;

export let courant = null;   // référence du client ouvert
let lotsContrat = [];
let dernierLotContrat = null;
let derniereRefContrat = null;
// ---------- OUVERTURE ET FERMETURE DE LA FICHE CLIENT 360° PLEIN ÉCRAN ----------

export async function ouvrirClient(ref, { garderDefilement = false } = {}) {
  const ongletActif = document.querySelector('.cl-onglet-btn.actif[data-onglet]')?.dataset.onglet;
  if (APP.dossiers && APP.dossiers.demonter) APP.dossiers.demonter();
  courant = ref;

  // Basculer sur l'écran fiche plein écran
  const ecranListe = $('cl-ecran-liste');
  const ecranFiche = $('cl-ecran-fiche');
  if (ecranListe) ecranListe.hidden = true;
  if (ecranFiche) ecranFiche.hidden = false;

  const fiche = $('cl-fiche');
  if (!fiche) return;
  fiche.innerHTML = '<p class="vide">Chargement de la fiche client…</p>';

  let c;
  try {
    c = await SIG.api('/api/clients/' + encodeURIComponent(ref) + '/');
  } catch (e) {
    fiche.innerHTML = `<p class="note erreur">Fiche indisponible : ${esc(e.message)}</p>`;
    return;
  }
  if (courant !== ref) return;

  // Mise à jour du fil d'Ariane
  const elArianeNom = $('cl-fiche-ariane-nom');
  if (elArianeNom) elArianeNom.textContent = c.nom || c.ref;

  // Mise à jour du hash pour supporter l'historique de navigation
  history.replaceState(null, '', '#clients/ref=' + encodeURIComponent(ref));

  const roleActif = getRoleActif();
  // Les scans contentieux ne sont pas des « dossiers du client » : ils se traitent dans la page
  // Contentieux & Remboursements, et seulement là. On les écarte avant tout calcul — bordereaux,
  // alertes, compteurs — pour qu'ils ne se mêlent pas aux pièces du dossier commercial.
  const docsContentieux = c.documents.filter((d) => d.categorie === 'contentieux');
  c = { ...c, documents: c.documents.filter((d) => d.categorie !== 'contentieux') };
  const actifs = c.dossiers.filter((d) => d.statut_dossier === 'actif');
  const somme = (l, k) => l.reduce((s, d) => s + (d[k] || 0), 0);
  const versOcr = c.documents.flatMap((d) => d.versements.map((v) => ({ ...v, document: d })));
  const totalBordereaux = versOcr.filter((v) => !estFrais(v)).reduce((s, v) => s + (v.montant || 0), 0);
  // Rapprochement avec le fichier commercial, cumulé **par lot** sur les dossiers actifs :
  // un acquéreur peut détenir plusieurs lots, chacun avec son propre PDF de bordereaux.
  const ecartRapprochement = actifs.reduce((s, d) => {
    const r = rapprochementLot(versOcr, d);
    return s + (r ? r.ecart : 0);
  }, 0);
  const aRemboursement = c.remboursements && c.remboursements.length > 0;
  const dossiersDesistes = c.dossiers.filter((d) => d.statut_dossier === 'desistement');
  const aDesistement = dossiersDesistes.length > 0;
  // Un scan contentieux ou un remboursement de nature Contentieux : c'est exactement le booléen
  // `contentieux` de la liste (clients.py:71), pour que l'onglet apparaisse sur les mêmes clients.
  const aContentieux = docsContentieux.length > 0
    || (c.remboursements || []).some((r) => r.nature === 'Contentieux');

  const sansDossier = !c.dossiers || c.dossiers.length === 0;
  lotsContrat = c.dossiers;
  if (derniereRefContrat !== ref) dernierLotContrat = null;
  derniereRefContrat = ref;
  const cible = APP.dossierCible;
  APP.dossierCible = null;
  const cibleValide = cible && c.dossiers.find((d) => d.id === Number(cible.id));
  // Un client peut avoir plusieurs contrats : un contrat = un dossier principal et ses lots rattachés.
  const contrats = c.dossiers.filter((d) => !d.dossier_principal_id);
  const contratsActifs = actifs.filter((d) => !d.dossier_principal_id);
  const lotChoisi = cibleValide || c.dossiers.find((d) => d.id === dernierLotContrat)
    || contratsActifs[0] || c.dossiers[0];
  // Les boutons « versement » hors du détail visent le contrat sélectionné (suivi par selectionnerLotContrat).
  const premierDossierId = lotChoisi ? (lotChoisi.dossier_principal_id || lotChoisi.id) : null;
  const optsLot = cibleValide ? { action: cible.action, lot: cible.lot, dossierId: cible.dossierId } : undefined;
  const acq = c.acquereur || {};
  const notesAffectation = Object.keys(NOTES_AFFECTATION)
    .filter((k) => c.dossiers.some((d) => (d.anomalies || []).includes(k)))
    .map((k) => NOTES_AFFECTATION[k]);
  const alertesDocs = [...new Set(c.documents.flatMap((d) => (d.alertes || []).filter((a) => a !== 'OCR_INCOMPLET')))];

  fiche.innerHTML = `
    <header class="cl-tete cl-fiche-tete">
      <div class="cl-fiche-identite">
        <div class="cl-fiche-meta">
          <span class="c-etiquette">Fiche client · réf. ${esc(c.ref)}</span>
          <span class="cl-badge-role ${roleActif}">${libelleRole(roleActif)}</span>
        </div>
        <h3>
          <span>${esc(c.nom || c.ref)}</span>
          ${sansDossier
            ? '<span class="cl-badge alerte">Aucun dossier commercial actif</span>'
            : (aRemboursement || aDesistement ? '<span class="cl-badge vigilance">Désistement / Remboursement</span>' : '<span class="cl-badge succes">Acquéreur sous contrat</span>')}
        </h3>
        <p class="aide cl-fiche-sous-titre">
          ${c.lots && c.lots.length ? 'Lot(s) ' + esc(c.lots.map((l) => l.code_lot).join(', ')) : (sansDossier ? 'Acquéreur en attente de réservation' : 'Sans lot au plan')}
          ${acq.telephone ? ' · ' + esc(acq.telephone) : ''}
          ${acq.email ? ' · ' + esc(acq.email) : ''}
          ${acq.profession ? ' · ' + esc(acq.profession) : ''}
        </p>
        ${notesAffectation.map((t) => `<p class="note" role="note">${esc(t)}</p>`).join('')}
      </div>

      <div class="cl-fiche-barre">
        <!-- Navigation : où aller. Distincte des actions, qui modifient ou produisent quelque chose. -->
        <div class="cl-fiche-nav" role="group" aria-label="Navigation">
          ${c.lots && c.lots.length ? (c.lots.length > 1 ? `
            <a class="bouton secondaire petit" href="#carte/lots=${esc(encodeURIComponent(c.lots.map((l) => l.code_lot).join(',')))}" title="Surligner ensemble les ${c.lots.length} lots de cet acquéreur sur le plan cadastral">
              ${ico('plan')}Voir les ${c.lots.length} lots sur le plan
            </a>
          ` : `
            <a class="bouton secondaire petit" href="#carte/lot=${esc(encodeURIComponent(c.lots[0].code_lot))}" title="Afficher le lot sur le plan cadastral">
              ${ico('plan')}Voir sur le plan
            </a>
          `) : ''}
        </div>

        <!-- Actions : ce qui modifie la fiche ou produit un document. -->
        <div class="cl-fiche-actions" role="group" aria-label="Actions">
          <!-- Actions du contrat choisi ci-dessous : documents et désistement, en tête de fiche. -->
          <span class="cl-actions-contrat" role="group" aria-label="Contrat choisi">
            <button type="button" class="bouton petit secondaire" data-contrat-doc="fiche_reservation" ${sansDossier ? 'disabled' : ''}>${ico('reservation')}Réservation</button>
            <button type="button" class="bouton petit secondaire" data-contrat-doc="appel_de_fonds" ${sansDossier ? 'disabled' : ''}>${ico('appel')}Appel de fonds</button>
            <button type="button" class="bouton petit secondaire" data-contrat-doc="releve" ${sansDossier ? 'disabled' : ''} title="Relevé de compte du contrat choisi">${ico('releve')}Relevé</button>
            <button type="button" class="bouton petit secondaire cl-btn-desistement" data-contrat-desistement disabled>${ico('desistement')}Désistement</button>
          </span>
                      <button type="button" class="bouton secondaire petit btn-copier-lien" data-lien="${esc(APP.lien('clients', c.ref))}" title="Copier le lien direct vers cette fiche client">
            ${ico('lien')}Copier le lien
          </button>
          <!-- Les actions sur un contrat (versement, documents, changement de lot, désistement) sont dans la
               barre du contrat choisi, onglet Contrat : ici, seulement ce qui porte sur l'acquéreur. -->
          ${['commercial', 'direction', 'recouvrement'].includes(roleActif) ? `
            <button type="button" class="bouton secondaire petit" data-action="rapprocher-ocr" data-ref="${esc(c.ref)}" title="Synchroniser instantanément les coordonnées avec les pièces scannées">
              ${ico('ocr')}Rapprocher OCR
            </button>
          ` : ''}

          <button type="button" class="bouton secondaire petit" data-action="export-excel" data-ref="${esc(c.ref)}"
                  title="Exporter cet acquéreur au format du classeur commercial — le fichier produit est réimportable">
            <svg class="cl-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h11l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M15 4v5h5"/><path d="M9 13l2 2 3-3"/></svg>Excel
          </button>

          <a class="bouton secondaire petit" href="#contentieux/demande=${esc(encodeURIComponent(c.ref))}"
             title="Établir la fiche de demande de remboursement : vérification des encaissements, frais, net à rembourser">
            ${ico('remboursement')}Demande de remboursement
          </a>
        </div>
      </div>
    </header>

    <div class="cl-role-barre">
      <div class="cl-role-libelle">
        <span>Vue métier :</span>
        <span class="cl-badge-role ${roleActif}">${libelleRole(roleActif)}</span>
      </div>
      <div class="cl-role-selecteur" role="group" aria-label="Perspective métier">
        <button type="button" class="cl-role-btn ${roleActif === 'commercial' ? 'actif' : ''}" data-role-vue="commercial" title="Perspective Commercial">Commercial</button>
        <button type="button" class="cl-role-btn ${roleActif === 'recouvrement' ? 'actif' : ''}" data-role-vue="recouvrement" title="Perspective Recouvrement">Recouvrement</button>
        <button type="button" class="cl-role-btn ${roleActif === 'direction' ? 'actif' : ''}" data-role-vue="direction" title="Perspective Direction">Direction</button>
        <button type="button" class="cl-role-btn ${roleActif === 'technicien' ? 'actif' : ''}" data-role-vue="technicien" title="Perspective Technique">Technique</button>
      </div>
    </div>

    <div class="tuiles cl-tuiles">
      ${sansDossier
        ? `
          ${tuile('Contrats', '0', 'Aucun contrat actif')}
          ${tuile('Lots rattachés', '0', 'En attente d’affectation')}
          ${tuile('Pièces GED scannées', num(c.documents.length), `${APP.pl(c.documents.length, 'document scanné', 'documents scannés')}`)}
          ${aRemboursement
            ? tuile('Solde à rembourser', fcfa(c.solde_remboursement), `Désistement (${fcfa(c.montant_rembourse)} restitué)`)
            : tuile('Statut commercial', 'Prospect / En attente', 'Prêt pour réservation')}
        `
        : (roleActif === 'recouvrement' ? `
          ${tuile('Créance engagée (Prix)', fcfa(somme(actifs, 'prix_vente')), 'Dossiers actifs')}
          ${tuile('Total versé comptabilisé', fcfa(somme(actifs, 'total_verse')), 'Encaissé fichier commercial')}
          ${tuile('Reliquat à recouvrer', `<span style="color:#86282b;">${fcfa(somme(actifs, 'reliquat'))}</span>`, actifs.length ? 'Reste à encaisser' : 'Aucun dossier actif')}
          ${tuile('Versements bordereaux', fcfa(totalBordereaux), `${APP.pl(versOcr.length, 'bordereau lu', 'bordereaux lus')}`)}
          ${ecartRapprochement ? tuile('Écart de rapprochement', `<span style="color:${ecartRapprochement > 0 ? '#2e7d32' : '#86282b'};">${fcfa(ecartRapprochement)}</span>`, `${ecartRapprochement > 0 ? 'lus en plus' : 'manquant'} par rapport au fichier commercial`) : ''}
        ` : (roleActif === 'direction' ? `
          ${tuile('CA Engagé (Ventes)', fcfa(somme(actifs, 'prix_vente')), APP.pl(contratsActifs.length, 'contrat actif', 'contrats actifs'))}
          ${tuile('Total Encaissé', fcfa(somme(actifs, 'total_verse')), 'Règlements reçus')}
          ${tuile('Solde résiduel', fcfa(somme(actifs, 'reliquat')), 'Reliquat global')}
          ${tuile('Conformité & GED', `${c.documents.length} doc(s)`, alertesDocs.length ? `${alertesDocs.length} alerte(s)` : 'Dossier conforme')}
        ` : (roleActif === 'technicien' ? `
          ${tuile('Lots rattachés', `${c.lots.length} lot(s)`, 'Cadastre du projet')}
          ${tuile('Phases', c.lots.map((l) => l.nom_phase).filter(Boolean).join(', ') || 'Phase 1', 'Implantation')}
          ${tuile('Types de villa', c.lots.map((l) => l.type_villa).filter(Boolean).join(', ') || '—', 'Modèle architectural')}
          ${tuile('Documents scannés', `${c.documents.length} doc(s)`, `${versOcr.length} bordereaux`)}
        ` : `
          ${tuile('Prix de vente total', fcfa(somme(actifs, 'prix_vente')), APP.pl(contratsActifs.length, 'contrat actif', 'contrats actifs'))}
          ${tuile('Total versé', fcfa(somme(actifs, 'total_verse')), 'Encaissé fichier commercial')}
          ${tuile('Reliquat restant dû', fcfa(somme(actifs, 'reliquat')), actifs.length ? '' : 'Aucun dossier actif')}
          ${aRemboursement
            ? tuile('Solde à rembourser', fcfa(c.solde_remboursement), `Désistement (${fcfa(c.montant_rembourse)} restitué)`)
            : tuile('Versements bordereaux', fcfa(totalBordereaux), `${APP.pl(versOcr.length, 'bordereau lu', 'bordereaux lus')}`)}
          ${ecartRapprochement ? tuile('Écart de rapprochement', `<span style="color:${ecartRapprochement > 0 ? '#2e7d32' : '#86282b'};">${fcfa(ecartRapprochement)}</span>`, `Bordereaux ${ecartRapprochement > 0 ? 'au-dessus' : 'en dessous'} du fichier commercial`) : ''}
        `)))}
    </div>

    ${alertes(c.documents)}

    <div class="cl-fiche-hybride">
      <aside class="cl-fiche-profil">
        ${profilCardHTML(c, roleActif)}
      </aside>

      <section class="cl-fiche-dossier">
        <nav class="cl-onglets-nav" aria-label="Sections de la fiche client">
          <button type="button" class="cl-onglet-btn actif" data-onglet="contrat">${contrats.length > 1 ? 'Contrats' : 'Contrat'}</button>
          <button type="button" class="cl-onglet-btn" data-onglet="versements">Versements</button>
          <button type="button" class="cl-onglet-btn" data-onglet="scans">Scans & OCR</button>
          ${aRemboursement || aDesistement ? '<button type="button" class="cl-onglet-btn cl-onglet-remb" data-onglet="remboursements">Désistements &amp; remboursements</button>' : ''}
          <button type="button" class="cl-onglet-btn" data-onglet="commentaires">Commentaires <span class="do-compte" id="cl-compte-commentaires" hidden></span></button>
          <button type="button" class="cl-onglet-btn" data-onglet="journal">Historique d'équipe</button>
        </nav>

        <div id="cl-panneau-contrat" class="cl-onglet-panneau actif">
          ${aContentieux ? avisContentieuxHTML(c, docsContentieux) : ''}
          <div class="cl-card">
            <div class="cl-card-entete">
              <h4 class="titre-section cl-card-titre">${contrats.length > 1 ? `Contrats · ${contrats.length}` : 'Contrat'} · ${APP.pl(c.dossiers.length, 'lot', 'lots')}</h4>
              ${(roleActif === 'commercial' || roleActif === 'direction') ? `
                <button type="button" class="bouton secondaire micro" data-action="creer-dossier" data-ref="${esc(c.ref)}">
                  + Nouveau contrat
                </button>
              ` : ''}
            </div>
            ${dossiersCartes(c.dossiers, c.lots, c.ref, roleActif, versOcr, lotChoisi && lotChoisi.id)}
            <div id="cl-contrat-detail"></div>
          </div>
        </div>

        <div id="cl-panneau-versements" class="cl-onglet-panneau">
          ${versementsParContrat(versOcr, c.dossiers, roleActif)}
        </div>

        <div id="cl-panneau-commentaires" class="cl-onglet-panneau"></div>

        <div id="cl-panneau-scans" class="cl-onglet-panneau">
          <div class="cl-fiche-scans">
            ${ocrBoxHTML(c)}
            ${conformiteBoxHTML(c, versOcr)}
            <div class="cl-card">
              <div class="cl-card-entete">
                <h4 class="titre-section cl-card-titre">${APP.pl(c.documents.length, 'Dossier scanné', 'Dossiers scannés')}</h4>
                <span class="aide">${num(c.documents.reduce((s, d) => s + (d.nb_pages || 0), 0))} pages totales</span>
                <button type="button" class="bouton ${c.documents.length ? 'secondaire ' : ''}micro" data-action="rattacher-scan" data-ref="${esc(c.ref)}">
                  + Rattacher un dossier scanné
                </button>
              </div>
              <div id="cl-rattacher-scan" class="cl-rattacher-scan" hidden></div>
              ${c.documents.length || !docsContentieux.length ? pieces(c.documents) : ''}
              ${docsContentieux.length ? `<h5 class="cl-sous-titre">Pièces du dossier contentieux <span class="aide">(contrat inclus dans le PDF ; à traiter dans Contentieux &amp; Remboursements)</span></h5>${pieces(docsContentieux)}` : ''}
            </div>
          </div>
        </div>

        ${aRemboursement || aDesistement ? `<div id="cl-panneau-remboursements" class="cl-onglet-panneau">
          ${aDesistement ? desistementsCardHTML(dossiersDesistes, c.remboursements, c.ref) : ''}
          ${aRemboursement ? remboursementsCardHTML(c.remboursements) : ''}
        </div>` : ''}

        <div id="cl-panneau-journal" class="cl-onglet-panneau">
          <div class="cl-card">
            <div class="cl-card-entete">
              <h4 class="titre-section cl-card-titre">Historique d'activité de l'équipe</h4>
              <button type="button" class="bouton secondaire micro" id="cl-journal-actualiser" data-ref="${esc(c.ref)}">Actualiser</button>
            </div>
            <div id="cl-journal-contenu"><p class="vide">Chargement…</p></div>
          </div>
        </div>
      </section>
    </div>
  `;

  if (lotChoisi) selectionnerLotContrat(lotChoisi.id, optsLot);

  profil.initial = { ref: c.ref, valeurs: valeursProfil(), origine: origineProfil(c.acquereur || {}) };
  if (garderDefilement && ongletActif) {
    const btn = document.querySelector(`.cl-onglet-btn[data-onglet="${ongletActif}"]`);
    if (btn) btn.click();
  }

  // Présence collab v2 : le serveur masque ref/nom pour qui n'a pas DONNEES_CLIENT, c'est pourquoi
  // les deux sont envoyés ici sans distinction de rôle.
  APP.collab?.ouvrir({
    type: 'client', id: c.ref, libelle: c.ref + ' — ' + (c.nom || c.ref),
    conteneur: fiche, entete: fiche.querySelector('.cl-fiche-meta'),
    recharger: () => ouvrirClient(c.ref, { garderDefilement: true })
  });
  // Sous-page « Commentaires » : commentaires permanents du client, classés par catégorie (ceux des contrats et lots
  // liés y figurent en lecture seule).
  APP.collab?.montrerPermanents($('cl-panneau-commentaires'), { surCompte: (n) => {
    const b = $('cl-compte-commentaires');
    if (b) { b.textContent = String(n); b.hidden = !n; }
  } });
  fiche.addEventListener('collab:reveler-ancre', revelerAncre);

  if (!garderDefilement) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo(0, 0);
  }
}

function revelerAncre(e) {   // onglets de la fiche client : Contrat, Versements, Scans…
  const panneau = e.target.closest('.cl-onglet-panneau');
  if (panneau && !panneau.classList.contains('actif')) {
    document.querySelector(`.cl-onglet-btn[data-onglet="${panneau.id.replace('cl-panneau-', '')}"]`)?.click();
  }
}

export function fermerFiche() {
  if (APP.dossiers && APP.dossiers.demonter) APP.dossiers.demonter();
  APP.collab?.fermer();
  courant = null;
  lotsContrat = [];
  const ecranFiche = $('cl-ecran-fiche');
  const ecranListe = $('cl-ecran-liste');
  if (ecranFiche) ecranFiche.hidden = true;
  if (ecranListe) ecranListe.hidden = false;
  history.replaceState(null, '', '#clients');
}

export function selectionnerLotContrat(id, opts) {
  const dossier = lotsContrat.find((d) => d.id === Number(id));
  if (!dossier || !courant) return;
  const idContrat = dossier.dossier_principal_id || dossier.id;
  dernierLotContrat = idContrat;
  document.querySelectorAll('#cl-panneau-contrat [role="tab"][data-lot-contrat]').forEach((carte) => {
    carte.setAttribute('aria-selected', String(Number(carte.dataset.lotContrat) === idContrat));
  });
  document.querySelectorAll('[data-action="versement"][data-contrat-courant]').forEach((b) => {
    b.dataset.dossierId = idContrat;
  });
  const detail = $('cl-contrat-detail');
  if (detail && APP.dossiers && APP.dossiers.monter) {
    APP.dossiers.monter(detail, idContrat, opts);
  }
}
