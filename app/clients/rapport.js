// Espace client : rapport d'état de la sélection (aperçu, PDF, HTML) et export CSV.
import { ANOMALIES, etat, filtres, GROUPES_FILTRES, LABELS_FILTRES, situation, SITUATIONS, tauxPaye } from './commun.js';
import { obtenirClientsFiltres } from './liste.js';
const { $, esc, num } = APP;
const fcfa = SIG.fmtFCFA;

// ============================================================================
// RAPPORT D'ÉTAT DYNAMIQUE SELON LES FILTRES (HTML & PDF MODERNE)
// ============================================================================

function recupererClientsSelectionnes() {
  if (etat.grille && etat.grille.api && typeof etat.grille.api.forEachNodeAfterFilterAndSort === 'function') {
    const lignes = [];
    etat.grille.api.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) lignes.push(node.data);
    });
    if (lignes.length > 0) return lignes;
  }
  return obtenirClientsFiltres() || (etat.donnees ? etat.donnees.clients : []);
}

function descriptionFiltresActifs() {
  const elts = [];
  const elQ = $('cl-q');
  const q = elQ ? elQ.value.trim() : '';
  if (q) elts.push(`Recherche : « ${q} »`);

  GROUPES_FILTRES.forEach((g) => {
    if (filtres[g] && filtres[g].size > 0) {
      const labels = [...filtres[g]].map((v) => (LABELS_FILTRES[g] && LABELS_FILTRES[g][v]) || v);
      const nomG = g === 'ged' ? 'GED' : g.charAt(0).toUpperCase() + g.slice(1);
      elts.push(`${nomG} : ${labels.join(', ')}`);
    }
  });

  return elts.length ? elts.join(' · ') : 'Ensemble du portefeuille (aucun filtre actif)';
}

function construireRapportEtatHTML(clients, descFiltres, avecBoutonsActions = true) {
  const cfgProjet = (APP.cfg && APP.cfg.projet) || { nom: 'Cité CDC Bambilor', maitre_ouvrage: 'SRT' };
  const dateGen = new Date();
  const dateFrStr = dateGen.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const heureFrStr = dateGen.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // Calcul des totaux et KPIs
  const nbClients = clients.length;
  const nbDossiers = clients.reduce((acc, c) => acc + (c.nb_dossiers || 0), 0);
  const totalVentes = clients.reduce((acc, c) => acc + (c.prix_vente || 0), 0);
  const totalVerse = clients.reduce((acc, c) => acc + (c.total_verse || 0), 0);
  const totalReliquat = clients.reduce((acc, c) => acc + (c.reliquat || 0), 0);
  const txRecouv = totalVentes > 0 ? ((totalVerse / totalVentes) * 100).toFixed(1) : '—';
  const nbScannes = clients.filter((c) => c.nb_documents > 0).length;
  const nbNonScannes = clients.filter((c) => !c.nb_documents).length;
  const nbContentieux = clients.filter((c) => c.contentieux).length;
  const nbRemb = clients.filter((c) => c.a_remboursement).length;

  const logoSvg = document.getElementById('logo-srt') ? document.getElementById('logo-srt').outerHTML : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport d'état — ${esc(cfgProjet.nom)} (${dateFrStr})</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap">
<style>
  :root {
    --accent: #86282B;
    --accent-clair: #FBEAEB;
    --encre: #2B2523;
    --gris: #6B625D;
    --trait: #E0D6C8;
    --sol: #F9F6F0;
    --blanc: #FFFFFF;
    --vert: #1B5E20;
    --vert-fond: #E8F5E9;
    --rouge: #B71C1C;
    --rouge-fond: #FFEBEE;
    --ambre: #E65100;
    --ambre-fond: #FFF3E0;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--encre);
    background: #F4EFE6;
    margin: 0;
    padding: 24px;
    font-size: 0.6875rem;
    line-height: 1.4;
  }
  .rapport-contenu {
    max-width: 1380px;
    margin: 0 auto;
    background: var(--blanc);
    padding: 28px 36px;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
  }
  .actions-bar {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--trait);
  }
  .btn {
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--blanc);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn.sec {
    background: var(--blanc);
    color: var(--accent);
  }
  .btn:hover { opacity: 0.9; }

  /* En-tête officiel */
  .rap-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid var(--accent);
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .rap-logo-wrap {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .rap-logo {
    width: 140px;
    height: auto;
    color: var(--accent);
    fill: currentColor;
  }
  .rap-projet-nom {
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--gris);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 2px;
  }
  .rap-titre {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--accent);
    margin: 0 0 4px;
  }
  .rap-meta-droite {
    text-align: right;
    font-size: 0.6875rem;
    color: var(--gris);
  }
  .rap-meta-droite strong {
    color: var(--encre);
  }

  /* Boîte filtres */
  .rap-filtres-box {
    background: var(--sol);
    border: 1px solid var(--trait);
    border-left: 4px solid var(--accent);
    padding: 10px 14px;
    border-radius: 4px;
    margin-bottom: 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .rap-filtres-label {
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    font-size: 0.625rem;
    letter-spacing: 0.05em;
  }
  .rap-filtres-val {
    font-size: 0.75rem;
    color: var(--encre);
    font-weight: 500;
  }

  /* Grille KPI */
  .rap-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
  .rap-kpi-card {
    background: var(--sol);
    border: 1px solid var(--trait);
    border-radius: 6px;
    padding: 12px 14px;
  }
  .rap-kpi-card.relief {
    background: var(--accent-clair);
    border-color: #E2B7B9;
  }
  .rap-kpi-label {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    color: var(--gris);
    margin-bottom: 4px;
  }
  .rap-kpi-card.relief .rap-kpi-label {
    color: var(--accent);
  }
  .rap-kpi-val {
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--encre);
    line-height: 1.2;
  }
  .rap-kpi-card.relief .rap-kpi-val {
    color: var(--accent);
  }
  .rap-kpi-sub {
    font-size: 0.625rem;
    color: var(--gris);
    margin-top: 2px;
  }

  /* Tableau */
  table.rap-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.6875rem;
  }
  table.rap-table th {
    background: var(--sol);
    color: var(--gris);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 9px 8px;
    border-top: 1px solid var(--trait);
    border-bottom: 2px solid var(--accent);
    text-align: left;
  }
  table.rap-table td {
    padding: 7px 8px;
    border-bottom: 1px solid #ECE4DA;
    vertical-align: middle;
  }
  table.rap-table tbody tr:nth-child(even) {
    background: #FAF8F5;
  }
  table.rap-table tbody tr:hover {
    background: #F4EFE6;
  }
  table.rap-table th.num, table.rap-table td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  table.rap-table th.cen, table.rap-table td.cen {
    text-align: center;
  }
  table.rap-table tfoot th, table.rap-table tfoot td {
    background: var(--sol);
    font-weight: 800;
    border-top: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    padding: 10px 8px;
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.5938rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-lot {
    background: var(--sol);
    border: 1px solid var(--trait);
    color: var(--encre);
    font-weight: 600;
  }
  .badge-phase {
    background: #EDE7DF;
    color: #4E4642;
    font-weight: 700;
  }
  .badge-solde { background: var(--vert-fond); color: var(--vert); }
  .badge-encours { background: #E2E8F0; color: #334155; }
  .badge-reliquat { background: var(--rouge-fond); color: var(--rouge); font-weight: 700; }
  .badge-remb { background: var(--ambre-fond); color: var(--ambre); font-weight: 700; }
  .badge-ged-ok { background: var(--vert-fond); color: var(--vert); font-weight: 600; }
  .badge-ged-non { background: var(--rouge-fond); color: var(--rouge); font-weight: 700; border: 1px solid #FFCDD2; }
  .badge-anom { background: #FFF9C4; color: #827717; border: 1px solid #FFF59D; }

  /* Barre pourcentage payé */
  .barre-pct {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: flex-end;
  }
  .barre-jauge {
    width: 45px;
    height: 6px;
    background: var(--trait);
    border-radius: 3px;
    overflow: hidden;
  }
  .barre-remplie {
    height: 100%;
    background: var(--accent);
  }
  .barre-remplie.pleine {
    background: var(--vert);
  }

  /* Pied officiel */
  .rap-footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid var(--trait);
    display: flex;
    justify-content: space-between;
    color: var(--gris);
    font-size: 0.625rem;
  }

  /* Règles d'impression pour PDF et Ctrl+P */
  @media print {
    body {
      padding: 0;
      background: #fff;
      font-size: 0.5938rem;
    }
    .rapport-contenu {
      max-width: none;
      padding: 0;
      box-shadow: none;
    }
    .actions-bar {
      display: none !important;
    }
    @page {
      size: A4 landscape;
      margin: 8mm 10mm;
    }
    table.rap-table {
      font-size: 0.5938rem;
    }
    table.rap-table th, table.rap-table td {
      padding: 4px 6px;
    }
    tr {
      page-break-inside: avoid;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    .rap-kpi-grid, .rap-header, .rap-filtres-box {
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>
<div class="rapport-contenu">
  <svg width="0" height="0" style="position:absolute">${logoSvg}</svg>

  ${avecBoutonsActions ? `
  <div class="actions-bar">
    <button type="button" class="btn" onclick="window.print()">🖨️ Imprimer / Sauvegarder en PDF</button>
  </div>` : ''}

  <header class="rap-header">
    <div class="rap-logo-wrap">
      <svg class="rap-logo" viewBox="2 2 243 103" role="img" aria-label="SRT"><use href="#logo-srt"/></svg>
      <div>
        <p class="rap-projet-nom">${esc(cfgProjet.nom)} · ${esc(cfgProjet.maitre_ouvrage)}</p>
        <h1 class="rap-titre">Rapport d'état du portefeuille clients</h1>
      </div>
    </div>
    <div class="rap-meta-droite">
      <p style="margin:0 0 2px;">Édité le <strong>${esc(dateFrStr)} à ${esc(heureFrStr)}</strong></p>
      <p style="margin:0;">Système d'Information Géographique (SIG Bambilor)</p>
    </div>
  </header>

  <div class="rap-filtres-box">
    <span class="rap-filtres-label">Filtres appliqués :</span>
    <span class="rap-filtres-val">${esc(descFiltres)}</span>
  </div>

  <div class="rap-kpi-grid">
    <div class="rap-kpi-card">
      <div class="rap-kpi-label">Portefeuille</div>
      <div class="rap-kpi-val">${num(nbClients)}</div>
      <div class="rap-kpi-sub">${num(nbDossiers)} dossier${nbDossiers > 1 ? 's' : ''}</div>
    </div>
    <div class="rap-kpi-card">
      <div class="rap-kpi-label">Ventes Totales</div>
      <div class="rap-kpi-val">${fcfa(totalVentes)}</div>
      <div class="rap-kpi-sub">Montant contractuel</div>
    </div>
    <div class="rap-kpi-card">
      <div class="rap-kpi-label">Total Encaissé</div>
      <div class="rap-kpi-val">${fcfa(totalVerse)}</div>
      <div class="rap-kpi-sub">Versements validés</div>
    </div>
    <div class="rap-kpi-card relief">
      <div class="rap-kpi-label">Reliquat Restant Dû</div>
      <div class="rap-kpi-val">${fcfa(totalReliquat)}</div>
      <div class="rap-kpi-sub">À recouvrer</div>
    </div>
    <div class="rap-kpi-card">
      <div class="rap-kpi-label">Taux Recouvrement</div>
      <div class="rap-kpi-val">${txRecouv}${txRecouv !== '—' ? '%' : ''}</div>
      <div class="rap-kpi-sub">Encaissé / Ventes</div>
    </div>
    <div class="rap-kpi-card">
      <div class="rap-kpi-label">Dossiers Physiques (GED)</div>
      <div class="rap-kpi-val">${num(nbScannes)} / ${num(nbClients)}</div>
      <div class="rap-kpi-sub">${nbNonScannes > 0 ? `<strong style="color:var(--rouge);">${nbNonScannes} sans dossier physique</strong>` : 'Tous scannés'}</div>
    </div>
  </div>

  <table class="rap-table">
    <thead>
      <tr>
        <th class="cen" style="width:36px;">#</th>
        <th>Acquéreur</th>
        <th style="width:130px;">Lot(s)</th>
        <th class="cen" style="width:75px;">Phase</th>
        <th class="num" style="width:125px;">Prix Vente</th>
        <th class="num" style="width:145px;">Total Versé</th>
        <th class="num" style="width:125px;">Reliquat Dû</th>
        <th class="cen" style="width:110px;">Statut</th>
        <th class="cen" style="width:125px;">Dossier Physique</th>
        <th>Anomalies / Risques</th>
      </tr>
    </thead>
    <tbody>
      ${clients.map((c, i) => {
        const sit = situation(c);
        const tPaye = tauxPaye(c);
        const solde = sit === 'solde';
        const aReliquat = (c.reliquat || 0) > 0;
        const aDoc = (c.nb_documents || 0) > 0;
        const anoms = (c.anomalies || []).map((a) => ANOMALIES[a] || a);
        return `<tr>
          <td class="cen aide" style="color:var(--gris);font-size:0.625rem;">${i + 1}</td>
          <td>
            <strong>${esc(c.nom || c.ref)}</strong>
            ${c.ref ? `<div style="font-size:0.5938rem;color:var(--gris);">Réf. ${esc(c.ref)}</div>` : ''}
          </td>
          <td>
            ${(c.lots || []).length ? c.lots.map((l) => `<span class="badge badge-lot">Lot ${esc(l)}</span>`).join(' ') : '<span class="badge badge-anom">Sans lot</span>'}
          </td>
          <td class="cen">
            ${(c.phases || []).length ? c.phases.map((p) => `<span class="badge badge-phase">${esc(p)}</span>`).join(' ') : '—'}
          </td>
          <td class="num">${c.prix_vente ? fcfa(c.prix_vente) : '—'}</td>
          <td class="num">
            <div class="barre-pct">
              <span><strong>${fcfa(c.total_verse || 0)}</strong></span>
              <span class="barre-jauge"><div class="barre-remplie ${solde ? 'pleine' : ''}" style="width:${tPaye}%"></div></span>
              <span style="font-size:0.5938rem;color:var(--gris);">${tPaye}%</span>
            </div>
          </td>
          <td class="num">
            ${aReliquat ? `<span class="badge badge-reliquat">${fcfa(c.reliquat)}</span>` : '<span class="badge badge-solde">Soldé</span>'}
          </td>
          <td class="cen">
            <span class="badge badge-${sit}">${esc(SITUATIONS[sit] ? SITUATIONS[sit].libelle : sit)}</span>
            ${c.contentieux ? '<br><span class="badge badge-reliquat" style="margin-top:2px;">Contentieux</span>' : ''}
            ${c.a_remboursement ? '<br><span class="badge badge-remb" style="margin-top:2px;">Désistement</span>' : ''}
          </td>
          <td class="cen">
            ${aDoc ? `<span class="badge badge-ged-ok">📁 Scanné (${c.nb_documents})</span>` : '<span class="badge badge-ged-non">❌ Non scanné</span>'}
          </td>
          <td>
            ${anoms.length ? anoms.map((a) => `<span class="badge badge-anom">${esc(a)}</span>`).join(' ') : '<span style="color:#A09893;">—</span>'}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right;">TOTAUX CONSOLIDÉS (${num(nbClients)} clients / ${num(nbDossiers)} dossiers) :</td>
        <td class="num">${fcfa(totalVentes)}</td>
        <td class="num">${fcfa(totalVerse)} (${txRecouv}%)</td>
        <td class="num" style="color:var(--rouge);">${fcfa(totalReliquat)}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>

  <footer class="rap-footer">
    <div>Programme Cité CDC Bambilor — Direction Commerciale & Recouvrement</div>
    <div>Document officiel généré par le SIG Lotissement · ${esc(dateFrStr)}</div>
  </footer>
</div>
</body>
</html>`;
}

export function afficherApercuRapport() {
  const clients = recupererClientsSelectionnes();
  if (!clients || !clients.length) {
    APP.erreur("Aucun client ne correspond aux filtres actuels.");
    return;
  }
  const desc = descriptionFiltresActifs();
  const html = construireRapportEtatHTML(clients, desc, true);

  if (etat.rapportApercuUrl) URL.revokeObjectURL(etat.rapportApercuUrl);
  etat.rapportApercuUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));

  const dlg = $('cl-dialogue-rapport');
  const sousTitre = $('cl-rap-sous-titre');
  const cadre = $('cl-rap-cadre');
  if (sousTitre) sousTitre.textContent = `${APP.pl(clients.length, 'client', 'clients')} · ${desc}`;
  if (cadre) cadre.src = etat.rapportApercuUrl;
  if (dlg) dlg.showModal();
}

export async function telechargerRapportPDF() {
  const btn = $('cl-btn-rapport-pdf');
  const btnModal = $('cl-rap-telecharger-pdf');
  if (!window.html2pdf) {
    APP.erreur("Le module html2pdf n'est pas disponible. Utilisez l'aperçu puis 'Imprimer' pour enregistrer en PDF.");
    return;
  }
  const texteInit = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Génération PDF…'; }
  if (btnModal) { btnModal.disabled = true; btnModal.textContent = 'Génération PDF…'; }

  try {
    const clients = recupererClientsSelectionnes();
    if (!clients || !clients.length) {
      APP.erreur("Aucun client ne correspond aux filtres actuels.");
      return;
    }
    const desc = descriptionFiltresActifs();
    const html = construireRapportEtatHTML(clients, desc, false);

    const conteneur = document.createElement('div');
    conteneur.style.position = 'absolute';
    conteneur.style.left = '-9999px';
    conteneur.style.top = '0';
    conteneur.style.width = '1120px';
    conteneur.innerHTML = html;
    document.body.appendChild(conteneur);

    const source = conteneur.querySelector('.rapport-contenu') || conteneur;
    const jour = new Date().toISOString().slice(0, 10);
    const nomFichier = `Rapport-Clients-Bambilor-${jour}.pdf`;

    await html2pdf().set({
      margin: [6, 8, 6, 8],
      filename: nomFichier,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.rap-kpi-card', '.rap-header'] },
    }).from(source).save();

    conteneur.remove();
  } catch (err) {
    APP.erreur("L'export PDF a échoué : " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteInit || '📥 Télécharger PDF'; }
    if (btnModal) { btnModal.disabled = false; btnModal.textContent = 'Télécharger PDF'; }
  }
}

export function telechargerRapportHTML() {
  const clients = recupererClientsSelectionnes();
  if (!clients || !clients.length) {
    APP.erreur("Aucun client ne correspond aux filtres actuels.");
    return;
  }
  const desc = descriptionFiltresActifs();
  const html = construireRapportEtatHTML(clients, desc, false);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const jour = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Rapport-Clients-Bambilor-${jour}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exporterCSV() {
  const clients = recupererClientsSelectionnes();
  if (!clients || !clients.length) {
    APP.erreur("Aucun client à exporter.");
    return;
  }
  const entetes = ['Référence', 'Nom Acquéreur', 'Lots', 'Phases', 'Prix de vente (FCFA)', 'Total versé (FCFA)', 'Reliquat (FCFA)', 'Statut compte', 'Dossier physique (GED)', 'Nb documents', 'Pages lues', 'Anomalies'];
  const lignes = [entetes];
  clients.forEach((c) => {
    const sit = SITUATIONS[situation(c)] ? SITUATIONS[situation(c)].libelle : '';
    const ged = c.nb_documents > 0 ? `Scanné (${c.nb_documents})` : 'Non scanné';
    const anom = (c.anomalies || []).map((a) => ANOMALIES[a] || a).join(' | ');
    lignes.push([
      c.ref || '',
      c.nom || '',
      (c.lots || []).join(', '),
      (c.phases || []).join(', '),
      c.prix_vente != null ? String(c.prix_vente) : '',
      c.total_verse != null ? String(c.total_verse) : '',
      c.reliquat != null ? String(c.reliquat) : '',
      sit,
      ged,
      String(c.nb_documents || 0),
      String(c.pages_lues || 0),
      anom,
    ]);
  });
  const csvContent = '\uFEFF' + lignes.map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const jour = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Selection-Clients-Bambilor-${jour}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
