// Chantiers — Rapports journaliers (Piste D) : liste, fiche, WhatsApp, impression, saisie.
import { afficheurs, dateFr, demarrerDictation, etat, fcfa } from './commun.js';
const { $, esc, num } = APP;

export async function afficherRapports() {
  $('ch-vue').value = 'rapports';
  $('ch-barre-filtres').hidden = true;
  $('ch-compteurs').hidden = true;
  $('ch-actions-fiche').hidden = true;
  $('ch-nouveau').hidden = true;
  $('ch-contenu').innerHTML = '<p class="vide">Chargement des rapports journaliers…</p>';

  try {
    etat.rapportsListe = await SIG.api('/api/chantiers/rapports-journaliers/');
  } catch (e) {
    etat.rapportsListe = [];
  }

  if (!etat.rapportsListe.length) {
    $('ch-contenu').innerHTML = `
      <div class="ch-rapports bloc">
        <div class="ch-cockpit-tete">
          <div>
            <span class="c-etiquette">Supervision de chantier</span>
            <h3 class="qc-h">Rapports Journaliers Technosol / SRT / KFE</h3>
          </div>
          <button type="button" class="bouton" id="ch-nouveau-rapport">Créer un rapport journalier</button>
        </div>
        <p class="vide">Aucun rapport journalier enregistré pour le moment.</p>
      </div>`;
    $('ch-nouveau-rapport')?.addEventListener('click', ouvrirModalNouveauRapport);
    return;
  }

  // Sélectionner le premier rapport par défaut si aucun n'est actif
  if (!etat.rapportActif || !etat.rapportsListe.some((r) => r.id === etat.rapportActif.id)) {
    try {
      etat.rapportActif = await SIG.api('/api/chantiers/rapports-journaliers/' + etat.rapportsListe[0].id + '/');
    } catch (e) {
      etat.rapportActif = etat.rapportsListe[0];
    }
  }

  dessinerVueRapports();
}

export function dessinerVueRapports() {
  const cartesHtml = etat.rapportsListe.map((r) => {
    const estActif = etat.rapportActif && etat.rapportActif.id === r.id;
    return `
      <div class="ch-rapport-carte ${estActif ? 'actif' : ''}" data-rapport-id="${num(r.id)}" tabindex="0" role="button">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>Rapport N° ${esc(r.numero_chrono)}</strong>
          <span class="badge-kfe" style="background:var(--creux);color:var(--encre);font-weight:700">${dateFr(r.date_rapport)}</span>
        </div>
        <p class="aide" style="margin:0">${esc(r.emetteur)} · Météo : ${esc(r.meteo || 'Ensoleillé')}</p>
        <div style="display:flex;gap:12px;font-size:0.75rem">
          <span>Personnel : <strong>${num(r.total_personnel || 0)}</strong></span>
          <span>Matériel : <strong>${num(r.total_materiel_actif || 0)}</strong></span>
        </div>
        <p style="font-size:0.75rem;color:var(--gris);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.constat_global || '—')}</p>
      </div>`;
  }).join('');

  // Détail du rapport actif
  const r = etat.rapportActif || {};
  const personnel = r.personnel || [];
  const materiels = r.materiels || [];
  const appros = r.approvisionnements || [];

  const personnelHtml = personnel.length ? `
    <table class="ch-table-effectifs">
      <thead>
        <tr>
          <th>Spécialité / Métier</th>
          <th class="num">Lot 57</th>
          <th class="num">Lot 103</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${personnel.map((p) => `
          <tr>
            <td>${esc(p.fonction)}</td>
            <td class="num">${num(p.lot_57 || 0)}</td>
            <td class="num">${num(p.lot_103 || 0)}</td>
            <td class="num"><strong>${num((p.lot_57 || 0) + (p.lot_103 || 0))}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>` : '<p class="aide">Aucun effectif renseigné.</p>';

  const materielsHtml = materiels.length ? `
    <table class="ch-table-effectifs">
      <thead>
        <tr>
          <th>Désignation de l'engin / outil</th>
          <th class="num">Lot 57</th>
          <th class="num">Lot 103</th>
          <th>État</th>
        </tr>
      </thead>
      <tbody>
        ${materiels.map((m) => `
          <tr>
            <td>${esc(m.designation)}</td>
            <td class="num">${num(m.lot_57 || 0)}</td>
            <td class="num">${num(m.lot_103 || 0)}</td>
            <td><span class="ch-pastille ${m.etat === 'Actif' ? 'estime' : 'retard'}">${esc(m.etat || 'Actif')}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>` : '<p class="aide">Aucun matériel renseigné.</p>';

  const approsHtml = appros.length ? `
    <table class="ch-table-effectifs">
      <thead>
        <tr>
          <th>Matériaux</th>
          <th class="num">Stock matin</th>
          <th class="num">Livraison jour</th>
          <th class="num">Consommé</th>
          <th class="num">Stock soir</th>
        </tr>
      </thead>
      <tbody>
        ${appros.map((a) => `
          <tr>
            <td>${esc(a.designation)}</td>
            <td class="num">${num(a.stock_matin || 0)}</td>
            <td class="num" style="color:var(--succes);font-weight:700">+${num(a.appro_jour || 0)}</td>
            <td class="num" style="color:var(--alerte)">-${num(a.consomme_jour || 0)}</td>
            <td class="num"><strong>${num(a.stock_soir || 0)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>` : '<p class="aide">Aucun approvisionnement renseigné.</p>';

  $('ch-contenu').innerHTML = `
    <div class="ch-rapports">
      <div class="bloc ch-cockpit-tete">
        <div>
          <span class="c-etiquette">Digitalisation Rapport Journalier (Piste D)</span>
          <h3 class="qc-h">Supervision et Contrôle Quotidien des Travaux</h3>
          <p class="aide">Rapports officiels émis par TECHNOSOL INGENIERIE / Maîtrise d'ouvrage SRT.</p>
        </div>
        <div class="ch-rapport-alternatives-barre">
          <button type="button" class="ch-btn-alt magique" id="ch-nouveau-consolide" title="Générer automatiquement à partir des pointages smartphone du jour">✨ Rapport consolidé (visites du jour)</button>
          <button type="button" class="ch-btn-alt" id="ch-nouveau-duplique" title="Reprendre les effectifs et matériels d'hier">📋 Dupliquer la veille</button>
          <button type="button" class="ch-btn-alt" id="ch-nouveau-vierge">➕ Nouveau rapport</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;align-items:start">
        <!-- Liste des rapports -->
        <div style="display:grid;gap:10px">
          <h4 style="margin:0 0 4px">Historique des Rapports</h4>
          <div class="ch-rapports-grille" style="grid-template-columns:1fr">
            ${cartesHtml}
          </div>
        </div>

        <!-- Fiche détaillée du rapport sélectionné -->
        <div class="ch-rapport-detail">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid var(--trait);padding-bottom:12px;flex-wrap:wrap">
            <div>
              <span class="c-etiquette">Rapport Journalier de Chantier</span>
              <h3 style="margin:4px 0">Rapport N° ${esc(r.numero_chrono || '—')}</h3>
              <p class="aide" style="margin:0">Date : <strong>${dateFr(r.date_rapport)}</strong> · Météo : <strong>${esc(r.meteo || '—')}</strong></p>
            </div>
            <div style="text-align:right">
              <span class="badge-kfe" style="background:var(--accent);color:#fff">KFE 160</span>
              <p class="aide" style="margin:4px 0 6px">Émetteur : ${esc(r.emetteur || 'TECHNOSOL')}</p>
              <div style="display:flex;gap:6px;justify-content:flex-end">
                <button type="button" class="bouton secondaire petit" id="ch-imprimer-rap">📄 Imprimer / PDF</button>
                <button type="button" class="bouton petit" id="ch-whatsapp-rap" style="background:#25D366;border-color:#25D366;color:#fff">📲 WhatsApp</button>
              </div>
            </div>
          </div>

          <!-- Constat Global -->
          <div class="ch-constat-bloc">
            <strong style="color:var(--alerte);display:block;margin-bottom:4px">Constat Général de la Journée :</strong>
            <p style="margin:0;line-height:1.5">${esc(r.constat_global || 'Aucun constat renseigné.')}</p>
          </div>

          <!-- Observations détaillées -->
          ${r.observations ? `
            <div>
              <h4 style="margin:0 0 6px">Observations Particulières sur Site</h4>
              <div style="white-space:pre-line;font-size:0.8125rem;line-height:1.5;background:var(--creux);padding:12px;border-radius:8px">${esc(r.observations)}</div>
            </div>` : ''}

          <!-- Effectifs du jour -->
          <div>
            <h4 style="margin:0 0 6px">Effectifs & Personnel Présent sur le Chantier</h4>
            ${personnelHtml}
          </div>

          <!-- Matériels & Engins -->
          <div>
            <h4 style="margin:0 0 6px">Matériel & Engins Mobilisés</h4>
            ${materielsHtml}
          </div>

          <!-- Approvisionnements -->
          <div>
            <h4 style="margin:0 0 6px">Approvisionnements & Matériaux Reçus</h4>
            ${approsHtml}
          </div>

          <!-- Recommandations formelles SRT -->
          <div class="ch-recom-bloc">
            <strong style="color:var(--ph3);display:block;margin-bottom:4px">Prescriptions & Demandes Formelles de la SRT à l'Entreprise KFE :</strong>
            <div style="white-space:pre-line;margin:0;line-height:1.5;font-size:0.8125rem">${esc(r.recommandations || 'Aucune prescription spécifique.')}</div>
          </div>
        </div>
      </div>
    </div>`;

  $('ch-nouveau-consolide')?.addEventListener('click', () => ouvrirModalNouveauRapport('consolide'));
  $('ch-nouveau-duplique')?.addEventListener('click', () => ouvrirModalNouveauRapport('duplique'));
  $('ch-nouveau-vierge')?.addEventListener('click', () => ouvrirModalNouveauRapport('vierge'));

  $('ch-imprimer-rap')?.addEventListener('click', () => imprimerRapportFiche(etat.rapportActif));
  $('ch-whatsapp-rap')?.addEventListener('click', () => partagerRapportWhatsApp(etat.rapportActif));

  $('ch-contenu').querySelectorAll('[data-rapport-id]').forEach((carte) => {
    const ouvrir = async () => {
      const id = Number(carte.dataset.rapportId);
      try {
        etat.rapportActif = await SIG.api('/api/chantiers/rapports-journaliers/' + id + '/');
        dessinerVueRapports();
      } catch (e) {
        console.error(e);
      }
    };
    carte.addEventListener('click', ouvrir);
    // Clavier : la carte est tabindex="0" role="button" — Entrée ou Espace déclenchent le même clic.
    carte.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      carte.click();
    });
  });
}

export function partagerRapportWhatsApp(rapport) {
  if (!rapport) return;
  const persTotal = (rapport.personnel || []).reduce((acc, p) => acc + (p.lot_57 || 0) + (p.lot_103 || 0), 0);
  const matTotal = (rapport.materiels || []).filter((m) => m.etat === 'Actif').reduce((acc, m) => acc + (m.lot_57 || 0) + (m.lot_103 || 0), 0);

  const texte = [
    `🏗️ *RAPPORT JOURNALIER CHANTIER BAMBILOR N° ${rapport.numero_chrono || '—'}*`,
    `📅 *Date :* ${dateFr(rapport.date_rapport)} | *Météo :* ${rapport.meteo || 'Ensoleillé'}`,
    `👷 *Effectifs :* ${persTotal} ouvriers mobilisés`,
    `🚜 *Matériels :* ${matTotal} engins actifs`,
    rapport.constat_global ? `\n📌 *Constat général :*\n${rapport.constat_global}` : '',
    rapport.observations ? `\n🔍 *Observations terrain :*\n${rapport.observations}` : '',
    rapport.recommandations ? `\n⚠️ *Prescriptions SRT :*\n${rapport.recommandations}` : '',
    `\n_Émetteur : ${rapport.emetteur || 'TECHNOSOL INGENIERIE / SRT'}_`
  ].filter(Boolean).join('\n');

  if (navigator.clipboard) {
    navigator.clipboard.writeText(texte).catch(() => {});
  }
  const url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(texte);
  window.open(url, '_blank');
}

export function imprimerRapportFiche(rapport) {
  if (!rapport) return;
  const f = window.open('', '_blank');
  if (!f) return;
  const n = (v) => Number(v) || 0;   // jamais de valeur brute dans le document.write
  const persRows = (rapport.personnel || []).map((p) =>
    `<tr><td>${esc(p.fonction)}</td><td style="text-align:right">${n(p.lot_57)}</td><td style="text-align:right">${n(p.lot_103)}</td><td style="text-align:right"><strong>${n(p.lot_57) + n(p.lot_103)}</strong></td></tr>`
  ).join('');
  const matRows = (rapport.materiels || []).map((m) =>
    `<tr><td>${esc(m.designation)}</td><td style="text-align:right">${n(m.lot_57) + n(m.lot_103)}</td><td>${esc(m.etat || 'Actif')}</td></tr>`
  ).join('');

  f.document.write(`
    <!doctype html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <title>Rapport Journalier N° ${esc(rapport.numero_chrono)}</title>
      <style>
        body { font-family: Montserrat, Arial, sans-serif; padding: 24px; color: #2B2523; line-height: 1.4; font-size: 0.8125rem; }
        .entete { display: flex; justify-content: space-between; border-bottom: 2px solid #86282B; padding-bottom: 12px; margin-bottom: 16px; }
        h1 { margin: 0; font-size: 1.25rem; color: #86282B; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 16px; font-size: 0.75rem; }
        th, td { border: 1px solid #E0D6C8; padding: 6px 8px; text-align: left; }
        th { background: #F0E9DE; }
        .bloc { background: #FAF7F2; border-left: 4px solid #86282B; padding: 10px 14px; margin-bottom: 14px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="entete">
        <div>
          <h1>RAPPORT JOURNALIER DE CHANTIER N° ${esc(rapport.numero_chrono)}</h1>
          <p style="margin:4px 0 0;font-size:0.75rem;color:#6B625D">Marché N° 001_SRT2026 · Finitions 160 villas Cité CDC Bambilor</p>
        </div>
        <div style="text-align:right">
          <strong>Date : ${dateFr(rapport.date_rapport)}</strong><br>
          <span>Météo : ${esc(rapport.meteo || 'Ensoleillé')}</span><br>
          <span style="font-size:0.6875rem;color:#6B625D">Émetteur : ${esc(rapport.emetteur || 'TECHNOSOL')}</span>
        </div>
      </div>

      <div class="bloc">
        <strong>Constat Général de la Journée :</strong>
        <p style="margin:4px 0 0">${esc(rapport.constat_global || '—')}</p>
      </div>

      ${rapport.observations ? `<div class="bloc" style="border-left-color:#B89548"><strong>Observations Techniques & Avancements :</strong><p style="margin:4px 0 0;white-space:pre-line">${esc(rapport.observations)}</p></div>` : ''}

      <h3>Effectifs & Personnel Présent</h3>
      <table>
        <thead><tr><th>Spécialité / Métier</th><th style="text-align:right">Lot 57</th><th style="text-align:right">Lot 103</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${persRows || '<tr><td colspan="4">Aucun effectif</td></tr>'}</tbody>
      </table>

      <h3>Matériels & Engins Mobilisés</h3>
      <table>
        <thead><tr><th>Désignation</th><th style="text-align:right">Quantité</th><th>État</th></tr></thead>
        <tbody>${matRows || '<tr><td colspan="3">Aucun matériel</td></tr>'}</tbody>
      </table>

      ${rapport.recommandations ? `<div class="bloc" style="border-left-color:#2D3B55"><strong>Prescriptions & Demandes SRT à l'entreprise KFE :</strong><p style="margin:4px 0 0;white-space:pre-line">${esc(rapport.recommandations)}</p></div>` : ''}

      <div style="margin-top:40px;display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid #E0D6C8;font-size:0.75rem">
        <div><strong>Visa Contrôleur (Technosol / SRT)</strong></div>
        <div><strong>Visa Entreprise (KFE)</strong></div>
      </div>
      <script>window.print();</script>
    </body>
    </html>
  `);
  f.document.close();
}

// Modèle dynamique pour le formulaire de saisie
let formulairePersonnel = [];
let formulaireMateriels = [];

export async function ouvrirModalNouveauRapport(mode = 'vierge') {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const chronoDefaut = '0' + (etat.rapportsListe.length + 53);

  $('ch-contenu').innerHTML = '<p class="vide">Préparation du rapport journalier…</p>';

  let autoData = null;
  let dernierData = null;

  if (mode === 'consolide') {
    try {
      autoData = await SIG.api('/api/chantiers/rapports-journaliers/auto-consolidation/?date=' + aujourdhui);
    } catch (e) {
      console.warn('Erreur auto-consolidation', e);
    }
  } else if (mode === 'duplique') {
    try {
      dernierData = await SIG.api('/api/chantiers/rapports-journaliers/dernier/');
    } catch (e) {
      console.warn('Erreur duplication dernier', e);
    }
  }

  formulairePersonnel = [
    { fonction: 'Maçons', lot_57: 0, lot_103: 4 },
    { fonction: 'Carreleurs', lot_57: 0, lot_103: 6 },
    { fonction: 'Plombiers', lot_57: 0, lot_103: 2 },
    { fonction: 'Électriciens', lot_57: 0, lot_103: 2 },
    { fonction: 'Peintres', lot_57: 0, lot_103: 3 },
    { fonction: 'Manœuvres', lot_57: 0, lot_103: 8 },
    { fonction: 'Gardiens', lot_57: 0, lot_103: 1 },
  ];

  if (dernierData && dernierData.personnel && dernierData.personnel.length) {
    formulairePersonnel = JSON.parse(JSON.stringify(dernierData.personnel));
  }

  formulaireMateriels = [
    { designation: 'Bétonnière', lot_57: 0, lot_103: 1, etat: 'Actif' },
    { designation: 'Aiguille vibrante', lot_57: 0, lot_103: 1, etat: 'Actif' },
    { designation: 'Pick-up KFE', lot_57: 0, lot_103: 1, etat: 'Actif' },
  ];
  if (dernierData && dernierData.materiels && dernierData.materiels.length) {
    formulaireMateriels = JSON.parse(JSON.stringify(dernierData.materiels));
  }

  const constatInitial = autoData?.proposition_constat || '';
  let observationsInitial = '';
  if (autoData && autoData.nb_villas_visitees > 0) {
    observationsInitial = `Villas contrôlées sur smartphone : ${autoData.lots_visites.join(', ')}.\n` +
      autoData.visites.map((v) => `• Lot ${v.code_lot} : ${v.commentaire || 'Pointage avancement'}`).join('\n');
  }
  const recommandationsInitial = autoData?.proposition_recommandations || '';

  const modeBadge = mode === 'consolide'
    ? '<div class="note succes" style="margin-bottom:12px">✨ <strong>Mode Auto-Consolidé :</strong> Les visites terrain saisies sur smartphone ont été injectées automatiquement ci-dessous !</div>'
    : (mode === 'duplique'
      ? '<div class="note" style="margin-bottom:12px;background:color-mix(in srgb, var(--accent) 8%, var(--papier))">📋 <strong>Mode Duplication :</strong> Les effectifs et matériels du rapport précédent ont été copiés. Ajustez avec les boutons +/-.</div>'
      : '');

  // Construire les compteurs de personnel tactiles
  const renderCompteursPersonnel = () => formulairePersonnel.map((p, idx) => `
    <div class="ch-compteur-ligne">
      <span class="ch-compteur-libelle">${esc(p.fonction)}</span>
      <div class="ch-compteur-controles">
        <span style="font-size:0.6875rem;color:var(--gris)">Lot 103 :</span>
        <button type="button" class="ch-btn-cpt" data-cpt-pers-dec="${idx}">-</button>
        <span class="ch-cpt-valeur" id="cpt-pers-val-${idx}">${num(p.lot_103 || 0)}</span>
        <button type="button" class="ch-btn-cpt" data-cpt-pers-inc="${idx}">+</button>
      </div>
    </div>
  `).join('');

  $('ch-contenu').innerHTML = `
    <div class="bloc" style="max-width:820px;margin:0 auto">
      <div class="ch-cockpit-tete" style="margin-bottom:16px">
        <div>
          <span class="c-etiquette">Digitalisation Chantier (Piste D)</span>
          <h3 class="qc-h">Saisie d'un Rapport Journalier de Chantier</h3>
        </div>
        <button type="button" class="bouton secondaire" id="ch-annuler-rapport">Annuler</button>
      </div>

      ${modeBadge}

      <div class="formulaire" style="display:grid;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label>Date du rapport<input type="date" id="rap-date" value="${aujourdhui}"></label>
          <label>N° Chrono<input type="text" id="rap-chrono" value="${chronoDefaut}" placeholder="Ex. 053"></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label>Émetteur<input type="text" id="rap-emetteur" value="${esc(dernierData?.emetteur || 'TECHNOSOL INGENIERIE / SRT')}"></label>
          <label>Météo<select id="rap-meteo">
            <option value="Ensoleillé">Ensoleillé</option>
            <option value="Nuageux">Nuageux</option>
            <option value="Pluvieux">Pluvieux (intempéries)</option>
            <option value="Orageux">Orageux</option>
          </select></label>
        </div>

        <!-- Constat général -->
        <div style="display:grid;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label for="rap-constat" style="font-weight:700">Constat général synthétique de la journée</label>
            <button type="button" class="ch-btn-vocal" id="rap-btn-vocal-constat">🎙️ Dicter</button>
          </div>
          <textarea id="rap-constat" rows="2" placeholder="Ex. Équipes mobilisées sur les 103 villas, carrelage en cours...">${esc(constatInitial)}</textarea>
        </div>

        <!-- Observations techniques -->
        <div style="display:grid;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label for="rap-observations" style="font-weight:700">Observations techniques détaillées</label>
            <button type="button" class="ch-btn-vocal" id="rap-btn-vocal-obs">🎙️ Dicter</button>
          </div>
          <textarea id="rap-observations" rows="4" placeholder="Points de blocage, encadrement présent, désordres constatés...">${esc(observationsInitial)}</textarea>
        </div>

        <!-- Compteurs d'effectifs tactiles -->
        <div style="display:grid;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h4 style="margin:0;font-size:0.875rem">Effectifs & Personnel Présent (Pointage Tactile)</h4>
            <span class="aide" style="margin:0">Ajustez avec les boutons +/-</span>
          </div>
          <div id="ch-grille-cpt-personnel" style="display:grid;gap:6px">
            ${renderCompteursPersonnel()}
          </div>
        </div>

        <!-- Recommandations -->
        <div style="display:grid;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label for="rap-recommandations" style="font-weight:700">Recommandations & Prescriptions SRT adressées à KFE</label>
            <button type="button" class="ch-btn-vocal" id="rap-btn-vocal-recom">🎙️ Dicter</button>
          </div>
          <textarea id="rap-recommandations" rows="3" placeholder="Mise en demeure, approvisionnements urgents...">${esc(recommandationsInitial)}</textarea>
        </div>

        <div id="rap-msg"></div>
        <div class="actions" style="margin-top:12px">
          <button type="button" class="bouton" id="rap-enregistrer">Enregistrer le rapport journalier</button>
          <button type="button" class="bouton secondaire" id="rap-annuler-btn">Annuler</button>
        </div>
      </div>
    </div>`;

  $('ch-annuler-rapport')?.addEventListener('click', afficherRapports);
  $('rap-annuler-btn')?.addEventListener('click', afficherRapports);
  $('rap-enregistrer')?.addEventListener('click', enregistrerNouveauRapport);

  // Brancher les boutons +/- des compteurs d'effectifs
  $('ch-grille-cpt-personnel')?.querySelectorAll('[data-cpt-pers-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.cptPersDec);
      formulairePersonnel[idx].lot_103 = Math.max(0, (formulairePersonnel[idx].lot_103 || 0) - 1);
      const valEl = $('cpt-pers-val-' + idx);
      if (valEl) valEl.textContent = num(formulairePersonnel[idx].lot_103);
    });
  });

  $('ch-grille-cpt-personnel')?.querySelectorAll('[data-cpt-pers-inc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.cptPersInc);
      formulairePersonnel[idx].lot_103 = (formulairePersonnel[idx].lot_103 || 0) + 1;
      const valEl = $('cpt-pers-val-' + idx);
      if (valEl) valEl.textContent = num(formulairePersonnel[idx].lot_103);
    });
  });

  // Brancher la dictée vocale
  $('rap-btn-vocal-constat')?.addEventListener('click', function () {
    demarrerDictation('rap-constat', this);
  });
  $('rap-btn-vocal-obs')?.addEventListener('click', function () {
    demarrerDictation('rap-observations', this);
  });
  $('rap-btn-vocal-recom')?.addEventListener('click', function () {
    demarrerDictation('rap-recommandations', this);
  });
}

export async function enregistrerNouveauRapport() {
  const btn = $('rap-enregistrer');
  btn.disabled = true;
  const msgEl = $('rap-msg');
  msgEl.className = '';
  msgEl.textContent = '';

  const payload = {
    date_rapport: $('rap-date').value,
    numero_chrono: $('rap-chrono').value.trim(),
    emetteur: $('rap-emetteur').value.trim(),
    meteo: $('rap-meteo').value,
    constat_global: $('rap-constat').value.trim(),
    observations: $('rap-observations').value.trim(),
    recommandations: $('rap-recommandations').value.trim(),
    personnel: formulairePersonnel,
    materiels: formulaireMateriels,
    approvisionnements: [
      { designation: 'Ciment (T)', stock_matin: 1, appro_jour: 2, consomme_jour: 1, stock_soir: 2 },
      { designation: 'Sable (m³)', stock_matin: 40, appro_jour: 0, consomme_jour: 5, stock_soir: 35 },
    ]
  };

  try {
    const res = await SIG.api('/api/chantiers/rapports-journaliers/', { method: 'POST', body: payload });
    msgEl.textContent = 'Rapport journalier N° ' + payload.numero_chrono + ' enregistré avec succès.';
    msgEl.className = 'msg succes';
    setTimeout(() => {
      etat.rapportActif = null;
      afficherRapports();
    }, 900);
  } catch (e) {
    msgEl.textContent = 'Erreur : ' + e.message;
    msgEl.className = 'msg erreur';
    btn.disabled = false;
  }
}

afficheurs.rapports = afficherRapports;
