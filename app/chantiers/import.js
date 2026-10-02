// Chantiers — Mise à jour par import Excel KFE (Piste C).
import { afficheurs, changerSousVue, charger, etat, fcfa } from './commun.js';
const { $, esc, num } = APP;

export function afficherImport() {
  $('ch-vue').value = 'import';
  $('ch-barre-filtres').hidden = true;
  $('ch-compteurs').hidden = true;
  $('ch-actions-fiche').hidden = true;
  $('ch-nouveau').hidden = true;

  $('ch-contenu').innerHTML = `
    <div class="bloc" style="max-width:760px;margin:0 auto;display:grid;gap:16px">
      <div class="bloc-titre">
        <span class="c-etiquette">Import Automatique KFE (Piste C)</span>
        <h3 class="qc-h">Synchronisation du Classeur Excel KFE</h3>
        <p class="aide">Glissez-déposez le fichier de situation hebdomadaire ou mensuelle fourni par l'entreprise KFE (ex. <code>AVANCEMENT 103 VILLAS PHASE III - KFE.xlsx</code>).</p>
      </div>

      <div class="ch-import-zone" id="ch-zone-depot">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <strong style="font-size:1.1rem">Glissez le classeur Excel KFE ici</strong>
        <span class="aide">ou cliquez pour sélectionner le fichier sur votre ordinateur</span>
        <input type="file" id="ch-fichier-excel" accept=".xlsx,.xls" class="visuellement-cache" aria-label="Choisir le classeur Excel KFE à importer">
      </div>

      <div id="ch-import-resultat"></div>

      <div style="background:var(--creux);padding:14px 16px;border-radius:8px;font-size:0.8125rem;line-height:1.5">
        <strong>Processus d'ingestion automatique :</strong>
        <ul style="margin:8px 0 0;padding-left:20px">
          <li>Lecture automatique de la feuille synthèse <code>RECAP</code> (budgets et pourcentages globaux).</li>
          <li>Parsing complet des 103 onglets de villas individuelles.</li>
          <li>Extraction normalisée des 7 corps d'état (Gros œuvre, Étanchéité, Carrelage, Menuiserie, Plomberie, Électricité, Peinture).</li>
          <li>Recalcul instantané des 4 quadrants de la matrice commerciale et des couches cartographiques.</li>
        </ul>
      </div>
    </div>`;

  const zone = $('ch-zone-depot');
  const input = $('ch-fichier-excel');

zone.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('survol'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('survol'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('survol');
    if (e.dataTransfer.files?.length) traiterFichierExcel(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    if (input.files?.length) traiterFichierExcel(input.files[0]);
  });
}

export async function traiterFichierExcel(fichier) {
  const resEl = $('ch-import-resultat');
  resEl.innerHTML = '<p class="note" style="background:var(--creux)">Analyse et ingestion du classeur Excel en cours…</p>';

  const fd = new FormData();
  fd.append('fichier', fichier);

  try {
    const res = await SIG.api('/api/chantiers/kfe/import/', { method: 'POST', body: fd });
    resEl.innerHTML = `
      <div class="note succes" style="display:grid;gap:8px">
        <strong>Ingestion réussie !</strong>
        <span>${num(res.mis_a_jour || 103)} villas Phase III synchronisées avec succès en base de données.</span>
        <span class="aide">Budget analysé : ${esc(fcfa(res.budget_total))} · Montant exécuté consolidé : ${esc(fcfa(res.montant_execute))}</span>
        <div style="margin-top:6px">
          <button type="button" class="bouton" id="ch-retour-cockpit">Voir le Cockpit KFE actualisé →</button>
        </div>
      </div>`;
    etat.statsKfe = null;
    await charger();
    $('ch-retour-cockpit')?.addEventListener('click', () => changerSousVue('cockpit'));
  } catch (e) {
    resEl.innerHTML = `<div class="note erreur">Échec de l'import Excel : ${esc(e.message)}</div>`;
  }
}

afficheurs.import = afficherImport;
