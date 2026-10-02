// Onglet Chantiers (V1-D / KFE 160) — contrat : docs/PLAN-V2-PLATEFORME.md & Marché N° 001_SRT2026.
// Inclut Cockpit Synthétique KFE 160 (Piste B), Matrice Commerciale (Piste E),
// Suivi des Lots, Rapports Journaliers Technosol/SRT (Piste D) et Import Excel (Piste C).
// Point d'entrée (module ES) : construire la vue, router les sous-vues et enregistrer APP.vues.
// Le code est réparti dans chantiers/ : commun, cockpit, dashboard, terrain, liste, rapports, import, detail (audit 23/09, R09).
import { appliquerQs, changerSousVue, charger, etat } from './chantiers/commun.js';
import { afficherDashboard } from './chantiers/dashboard.js';
import { afficherCockpit } from './chantiers/cockpit.js';
import { afficherModeTerrain } from './chantiers/terrain.js';
import { afficherListe } from './chantiers/liste.js';
import { afficherRapports } from './chantiers/rapports.js';
import { afficherImport } from './chantiers/import.js';
import { afficherDetail, chargerDetail, initGraphVisites, ouvrirNouveauChantier } from './chantiers/detail.js';
const { $, esc } = APP;

// Chaque import ci-dessus enregistre son afficheur dans `afficheurs` (chantiers/commun.js) :
// cockpit, dashboard, terrain, lots, rapports et import s'y auto-déclarent à l'import.
// Le routeur `changerSousVue` les appelle sans dépendances circulaires.

// Chargement en cours. Le routeur rappelle `afficher` à chaque entrée sur la vue : sans cette
// promesse partagée, deux appels simultanés déclenchaient deux fois la requête chantiers.
let enCours = null;

function construire() {
  const s = $('vue-chantiers');
  if (s.dataset.pret) return;
  s.innerHTML = `
    <input type="hidden" id="ch-vue" value="cockpit">
    <div class="s-actions" id="ch-actions">
      <div class="ch-intro">
        <h2 class="qc-h">Chantiers</h2>
        <p class="s-portee">Supervision opérationnelle · Travaux réels · clients fictifs · lecture seule.</p>
      </div>
      <div class="ch-actions-haut" id="ch-actions-fiche" hidden>
        <button type="button" id="ch-retour" class="bouton secondaire">← Retour à la liste</button>
        <button type="button" id="ch-copier" class="bouton secondaire btn-copier-lien" title="Copier le lien direct vers ce chantier">🔗 Copier le lien</button>
        <button type="button" id="ch-visiter" class="bouton">Nouvelle visite</button>
      </div>
      <button type="button" id="ch-nouveau" class="bouton" hidden>Nouveau chantier</button>
    </div>

    <!-- Sous-onglets de navigation Chantiers -->
    <div class="ch-onglets-sousvue" id="ch-onglets-sousvue">
      <button type="button" class="ch-sousonglet" data-sousvue="cockpit">Cockpit KFE (160)</button>
      <button type="button" class="ch-sousonglet" data-sousvue="dashboard">Tableau de bord KFE</button>
      <button type="button" class="ch-sousonglet ch-sousonglet-terrain" data-sousvue="terrain">📱 Mode Terrain (Smartphone)</button>
      <button type="button" class="ch-sousonglet" data-sousvue="lots">Suivi des Lots</button>
      <button type="button" class="ch-sousonglet" data-sousvue="rapports">Rapports Journaliers</button>
      <button type="button" class="ch-sousonglet" data-sousvue="import">Mise à jour Excel KFE</button>
    </div>

    <div class="ch-compteurs" id="ch-compteurs" hidden>
      <button type="button" class="ch-compteur" data-compteur="en_cours"><span id="ch-compte-en-cours">0</span><span>En cours</span></button>
      <button type="button" class="ch-compteur" data-compteur="retard"><span id="ch-compte-retard">0</span><span>En retard</span></button>
      <button type="button" class="ch-compteur" data-compteur="sans_visite"><span id="ch-compte-sans-visite">0</span><span>Sans visite</span></button>
      <button type="button" class="ch-compteur" data-compteur="reserves"><span id="ch-compte-reserves">0</span><span>Réserves</span></button>
    </div>

    <div class="ch-barre-filtres" id="ch-barre-filtres" hidden>
      <label class="visuellement-cache" for="ch-q">Rechercher un n° de lot ou acquéreur</label>
      <input type="search" id="ch-q" placeholder="N° de lot ou acquéreur…" autocomplete="off">
      <label class="visuellement-cache" for="ch-filtre-contrat">Contrat KFE</label>
      <select id="ch-filtre-contrat">
        <option value="">Tous les chantiers</option>
        <option value="LOT 103">Lot 103 (Phase III)</option>
        <option value="LOT 57">Lot 57 (Phase I & II)</option>
      </select>
      <label class="visuellement-cache" for="ch-filtre-commercial">Croisement Commercial</label>
      <select id="ch-filtre-commercial">
        <option value="">Tous statuts commerciaux</option>
        <option value="prets_remise">1. Livrables prêts</option>
        <option value="alerte_recouvrement">2. Alerte recouvrement</option>
        <option value="priorite_chantier">3. Priorité chantier</option>
        <option value="disponibles">4. Stock disponible</option>
      </select>
      <label class="visuellement-cache" for="ch-phase">Phase</label>
      <select id="ch-phase"><option value="">Toutes les phases</option></select>
      <label class="visuellement-cache" for="ch-entreprise">Entreprise</label>
      <select id="ch-entreprise"><option value="">Toutes les entreprises</option></select>
      <label class="visuellement-cache" for="ch-etat">État</label>
      <select id="ch-etat"><option value="">Tous les états</option></select>
      <button type="button" id="ch-reset" class="bouton secondaire">Effacer</button>
      <span id="ch-resultat" class="ch-resultat" aria-live="polite">0 chantier</span>
    </div>

    <div id="ch-contenu" class="ch-contenu"></div>`;
  s.dataset.pret = '1';

  // Brancher les sous-onglets
  s.querySelectorAll('.ch-sousonglet').forEach((btn) => {
    btn.addEventListener('click', () => changerSousVue(btn.dataset.sousvue));
  });

  $('ch-q').addEventListener('input', () => { etat.filtres.q = $('ch-q').value; afficherListe(); });
  $('ch-filtre-contrat').addEventListener('change', () => { etat.filtres.contrat = $('ch-filtre-contrat').value; afficherListe(); });
  $('ch-filtre-commercial').addEventListener('change', () => { etat.filtres.commercial = $('ch-filtre-commercial').value; afficherListe(); });
  $('ch-phase').addEventListener('change', () => { etat.filtres.phase = $('ch-phase').value; afficherListe(); });
  $('ch-entreprise').addEventListener('change', () => { etat.filtres.entreprise = $('ch-entreprise').value; afficherListe(); });
  $('ch-etat').addEventListener('change', () => { etat.filtres.etat = $('ch-etat').value; afficherListe(); });
  $('ch-reset').addEventListener('click', resetFiltres);
  $('ch-compteurs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-compteur]');
    if (!b) return;
    etat.filtres.compteur = etat.filtres.compteur === b.dataset.compteur ? '' : b.dataset.compteur;
    afficherListe();
  });
  $('ch-retour').addEventListener('click', () => {
    APP.collab?.fermer();
    etat.detail = null;
    changerSousVue(etat.sousVue === 'cockpit' ? 'cockpit' : 'lots');
  });
  $('ch-nouveau').addEventListener('click', ouvrirNouveauChantier);
  window.addEventListener('resize', () => {
    if ($('ch-vue').value === 'liste') afficherListe();
    etat.graph?.resize();
  });
  document.addEventListener('sig:theme', () => {
    if (etat.grille) { etat.grille.destroy(); etat.grille = null; afficherListe(); }
    if (etat.graph) { etat.graph.dispose(); initGraphVisites(); }
    if (etat.sousVue === 'dashboard' && $('ch-minicarte')) afficherDashboard();
  });
}

function resetFiltres() {
  etat.filtres = { q: '', phase: '', entreprise: '', etat: '', compteur: '', commercial: '', contrat: '' };
  $('ch-q').value = '';
  $('ch-filtre-contrat').value = '';
  $('ch-filtre-commercial').value = '';
  $('ch-phase').value = '';
  $('ch-entreprise').value = '';
  $('ch-etat').value = '';
  afficherListe();
}

async function afficher(r) {
  construire();
  if (r?.lot) {
    if (!etat.donnees.length && !enCours) enCours = charger().finally(() => (enCours = null));
    if (enCours) await enCours;
    if (!etat.detail || etat.detail.code_lot !== r.lot) await chargerDetail(r.lot);
    else afficherDetail();
  } else {
    APP.collab?.fermer();
    if (!etat.donnees.length && !enCours) enCours = charger().finally(() => (enCours = null));
    if (enCours) await enCours;
    appliquerQs();
    changerSousVue(etat.sousVue);
  }
}

APP.vues.chantiers = { afficher };
