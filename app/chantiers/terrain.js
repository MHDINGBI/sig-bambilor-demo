// Chantiers — Mode Terrain (Smartphone First / visites KFE).
import { afficheurs, arreterDictation, charger, CORPS_ETAT_KFE, demarrerDictation, etat, fcfa, norm, redimensionner } from './commun.js';
const { $, esc, num } = APP;

export async function afficherModeTerrain(codeLotOptionnel) {
  $('ch-vue').value = 'terrain';
  $('ch-actions-fiche').hidden = true;
  $('ch-barre-filtres').hidden = true;
  $('ch-compteurs').hidden = true;
  $('ch-nouveau').hidden = true;

  if (!etat.kfeDonnees.length) {
    $('ch-contenu').innerHTML = '<p class="vide">Chargement des données terrain…</p>';
    try {
      await charger();
    } catch (e) {
      $('ch-contenu').innerHTML = `<p class="note erreur">Erreur chargement terrain : ${esc(e.message)}</p>`;
      return;
    }
  }

  if (codeLotOptionnel) {
    etat.lotTerrainActif = codeLotOptionnel;
  } else if (!etat.lotTerrainActif && etat.kfeDonnees.length) {
    etat.lotTerrainActif = etat.kfeDonnees[0].code_lot;
  }

  const indexLot = etat.kfeDonnees.findIndex((k) => k.code_lot === etat.lotTerrainActif);
  const lotPrecedent = indexLot > 0 ? etat.kfeDonnees[indexLot - 1].code_lot : null;
  const lotSuivant = (indexLot >= 0 && indexLot < etat.kfeDonnees.length - 1) ? etat.kfeDonnees[indexLot + 1].code_lot : null;

  $('ch-contenu').innerHTML = '<p class="vide">Chargement de la villa ' + esc(etat.lotTerrainActif || '') + '…</p>';

  try {
    etat.lotTerrainData = await SIG.api('/api/chantiers/kfe/' + encodeURIComponent(etat.lotTerrainActif) + '/');
  } catch (e) {
    etat.lotTerrainData = etat.kfeMap.get(etat.lotTerrainActif) || { code_lot: etat.lotTerrainActif };
  }

  etat.corpsModifiesTerrain = {};
  etat.photosTerrain = [];

  dessinerVueTerrain(indexLot, lotPrecedent, lotSuivant);
}

export function dessinerVueTerrain(indexLot, lotPrecedent, lotSuivant) {
  const lot = etat.lotTerrainData || {};
  const totalLots = etat.kfeDonnees.length || 160;
  const code = lot.code_lot || etat.lotTerrainActif;
  const reliquatNum = Number(lot.reliquat || 0);
  const avGlobal = Math.round(Number(lot.avancement_global || 0));

  const corpsHtml = CORPS_ETAT_KFE.map((c) => {
    const pctVal = Math.round(Number(lot[`${c.id}_pct`] || 0));
    const budgetVal = Number(lot[`${c.id}_budget`] || 0);
    const montantVal = Number(lot[`${c.id}_montant`] || 0);
    const estModif = c.id in etat.corpsModifiesTerrain;
    const affichePct = estModif ? etat.corpsModifiesTerrain[c.id] : pctVal;

    return `
      <div class="ch-terrain-corps-carte ${estModif ? 'modifie' : ''}" id="terrain-carte-${c.id}">
        <div class="ch-terrain-corps-entete">
          <span class="ch-terrain-corps-titre">${c.icone} ${esc(c.nom)}</span>
          <span class="ch-terrain-corps-pct" id="terrain-pct-txt-${c.id}">${num(affichePct)} %</span>
        </div>
        <div class="ch-corps-jauge">
          <span id="terrain-jauge-${c.id}" style="width:${Math.min(100, Math.max(0, affichePct))}%"></span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.6875rem;color:var(--gris);margin-top:2px">
          <span>Exécuté : <strong id="terrain-montant-${c.id}">${esc(fcfa(montantVal))}</strong></span>
          <span>Budget : ${esc(fcfa(budgetVal))}</span>
        </div>
        <div class="ch-terrain-boutons-rang">
          <button type="button" class="ch-btn-inc" data-inc="${c.id}:5">+5%</button>
          <button type="button" class="ch-btn-inc" data-inc="${c.id}:10">+10%</button>
          <button type="button" class="ch-btn-palier ${affichePct === 25 ? 'actif' : ''}" data-palier="${c.id}:25">25%</button>
          <button type="button" class="ch-btn-palier ${affichePct === 50 ? 'actif' : ''}" data-palier="${c.id}:50">50%</button>
          <button type="button" class="ch-btn-palier ${affichePct === 75 ? 'actif' : ''}" data-palier="${c.id}:75">75%</button>
          <button type="button" class="ch-btn-palier ch-btn-100 ${affichePct === 100 ? 'actif' : ''}" data-palier="${c.id}:100">✓ 100%</button>
        </div>
      </div>`;
  }).join('');

  const reserves = lot.reserves || [];
  const reservesOuvertes = reserves.filter((r) => r.statut === 'ouverte');
  const reservesHtml = reservesOuvertes.length ? reservesOuvertes.map((r) => `
    <div class="ch-res-terrain-item ${esc(r.gravite)}" id="terrain-res-item-${r.id}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="ch-gravite ${esc(r.gravite)}">${esc(r.gravite)}</span>
          ${r.etape ? `<span class="aide" style="margin:0;font-weight:700">${esc(r.etape)}</span>` : ''}
        </div>
        <p style="margin:4px 0 0;font-size:0.8125rem;line-height:1.35">${esc(r.description)}</p>
      </div>
      <button type="button" class="bouton ch-btn-lever-res" data-lever-terrain="${num(r.id)}">✓ Lever</button>
    </div>
  `).join('') : '<p class="aide" style="margin:0">Aucune réserve ouverte sur cette villa.</p>';

  const tagsPhoto = ['Gros œuvre', 'Carrelage', 'Façade', 'Menuiserie', 'Plomberie', 'Électricité', 'Peinture', 'Réserve', 'Autre'];
  const tagsHtml = tagsPhoto.map((t) =>
    `<button type="button" class="ch-photo-tag ${t === etat.tagPhotoActif ? 'actif' : ''}" data-photo-tag="${esc(t)}">${esc(t)}</button>`
  ).join('');

  $('ch-contenu').innerHTML = `
    <div class="ch-terrain">
      <!-- Barre de navigation rapide des lots -->
      <div class="ch-terrain-nav">
        <button type="button" class="bouton secondaire" id="terrain-btn-prec" ${!lotPrecedent ? 'disabled' : ''}>← Précédent</button>
        <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center">
          <input type="search" id="terrain-input-recherche" inputmode="numeric" placeholder="N° lot (ex: 1024)…" value="${esc(code)}">
        </div>
        <button type="button" class="bouton secondaire" id="terrain-btn-suiv" ${!lotSuivant ? 'disabled' : ''}>Suivant →</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--gris);padding:0 6px">
        <span>Villa <strong>${indexLot >= 0 ? indexLot + 1 : '—'}</strong> sur ${num(totalLots)}</span>
        <a href="#chantiers/lot=${encodeURIComponent(code)}" class="lien" style="font-size:0.75rem">Ouvrir fiche complète →</a>
      </div>

      <!-- Fiche d'identité de la villa -->
      <div class="ch-terrain-villa-carte">
        <div class="ch-terrain-villa-tete">
          <div>
            <span class="c-etiquette">${esc(lot.lot_contrat || 'Marché Finition 160')} · ${esc(lot.phase || 'Phase III')}</span>
            <h3>Villa ${esc(code)} · ${esc(lot.type_villa || '—')}</h3>
          </div>
          <span class="badge-kfe" style="background:var(--accent);color:#fff">${esc(lot.lot_contrat || 'KFE')}</span>
        </div>

        <div class="ch-terrain-badgerow">
          ${lot.compte_solde
            ? '<span class="cl-solde-val">Soldé (100%)</span>'
            : (reliquatNum > 0 ? `<span class="cl-reliquat-val" style="background:var(--creux);padding:2px 8px;border-radius:4px">Reliquat : ${esc(fcfa(reliquatNum))}</span>` : '')}
          <span style="font-size:0.75rem;color:var(--gris)">Acquéreur : <strong>${esc(lot.acquereur_nom || 'Non réservé')}</strong></span>
        </div>

        <!-- Jauge Globale Dynamique -->
        <div style="display:grid;gap:4px;margin-top:6px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-size:0.8125rem;font-weight:700">Avancement Global Villa :</span>
            <strong style="font-size:1.4rem;color:var(--accent)" id="terrain-avancement-global-txt">${num(avGlobal)} %</strong>
          </div>
          <div class="ch-corps-jauge" style="height:12px">
            <span id="terrain-avancement-global-barre" style="width:${Math.min(100, Math.max(0, avGlobal))}%"></span>
          </div>
        </div>
      </div>

      <!-- 7 Corps d'état Finitions KFE -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
        <h4 style="margin:0;font-size:0.875rem;text-transform:uppercase;letter-spacing:.06em">7 Corps d'État (Finitions KFE)</h4>
        <span class="aide" style="margin:0">Pointage tactile instantané</span>
      </div>
      <div class="ch-terrain-corps-grille">
        ${corpsHtml}
      </div>

      <!-- Prise de photos directes -->
      <div class="ch-terrain-photos-bloc">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4 style="margin:0;font-size:0.875rem">Photos Terrain</h4>
          <span class="aide" style="margin:0">Compressées auto pour 3G</span>
        </div>

        <div class="ch-photo-tag-selecteur">
          ${tagsHtml}
        </div>

        <label class="ch-terrain-photo-declencheur">
          <input type="file" id="terrain-photo-input" accept="image/*" capture="environment" multiple>
          <span>📷 Prendre une photo / Ajouter</span>
          <span style="font-size:0.6875rem;font-weight:normal;color:var(--gris)">Étiquette : <strong id="terrain-tag-label">${esc(etat.tagPhotoActif)}</strong></span>
        </label>

        <div class="ch-terrain-galerie" id="terrain-galerie"></div>
      </div>

      <!-- Réserves ouvertes & nouvelle réserve -->
      <div class="ch-terrain-reserves-bloc">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4 style="margin:0;font-size:0.875rem">Réserves sur la Villa (${num(reservesOuvertes.length)})</h4>
          <button type="button" class="bouton secondaire petit" id="terrain-btn-nouv-res">➕ Nouvelle réserve</button>
        </div>
        <div id="terrain-liste-reserves" style="display:grid;gap:8px">
          ${reservesHtml}
        </div>
        <div id="terrain-form-nouv-res" style="display:none;background:var(--creux);padding:12px;border-radius:8px;margin-top:8px">
          <h5 style="margin:0 0 8px">Déclarer une réserve sur la villa</h5>
          <div style="display:grid;gap:8px">
            <div style="display:flex;gap:6px">
              <button type="button" class="bouton secondaire petit ch-res-grav-btn actif" data-grav="mineure">Mineure</button>
              <button type="button" class="bouton secondaire petit ch-res-grav-btn" data-grav="majeure">Majeure</button>
              <button type="button" class="bouton secondaire petit ch-res-grav-btn" data-grav="bloquante">Bloquante</button>
            </div>
            <input type="text" id="terrain-nouv-res-desc" placeholder="Description du désordre...">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <button type="button" class="ch-btn-vocal" id="terrain-btn-vocal-res">🎙️ Dicter</button>
              <div style="display:flex;gap:6px">
                <button type="button" class="bouton petit" id="terrain-confirmer-nouv-res">Ajouter</button>
                <button type="button" class="bouton secondaire petit" id="terrain-annuler-nouv-res">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dictée Vocale & Remarques générales de visite -->
      <div class="bloc" style="display:grid;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <label for="terrain-commentaire" style="font-weight:700;font-size:0.875rem">Remarques & Observations Visite</label>
          <button type="button" class="ch-btn-vocal" id="terrain-btn-vocal-obs">🎙️ Dicter l'observation</button>
        </div>
        <textarea id="terrain-commentaire" rows="3" placeholder="Constat visuel, propreté, anomalies particulières..."></textarea>
      </div>

      <div id="terrain-msg"></div>

      <!-- Barre fixe basse de validation -->
      <div class="ch-terrain-barre-action">
        <button type="button" class="bouton" id="terrain-enregistrer-visite">💾 Enregistrer la visite</button>
        <div class="ch-terrain-options-bas">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="terrain-auto-suivant" checked> Villa suivante automatique
          </label>
          <span id="terrain-statut-synchro">🟢 En ligne</span>
        </div>
      </div>
    </div>`;

  brancherInteractionsTerrain(indexLot, lotPrecedent, lotSuivant);
}

export function brancherInteractionsTerrain(indexLot, lotPrecedent, lotSuivant) {
  $('terrain-btn-prec')?.addEventListener('click', () => {
    if (lotPrecedent) afficherModeTerrain(lotPrecedent);
  });
  $('terrain-btn-suiv')?.addEventListener('click', () => {
    if (lotSuivant) afficherModeTerrain(lotSuivant);
  });

  const inputRecherche = $('terrain-input-recherche');
  inputRecherche?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = inputRecherche.value.trim().toUpperCase();
      const trouve = etat.kfeDonnees.find((k) => norm(k.code_lot) === q || norm(k.code_lot).includes(q));
      if (trouve) afficherModeTerrain(trouve.code_lot);
    }
  });

  $('ch-contenu').querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [corpsId, incStr] = btn.dataset.inc.split(':');
      const inc = Number(incStr);
      const lot = etat.lotTerrainData || {};
      const basePct = corpsId in etat.corpsModifiesTerrain ? etat.corpsModifiesTerrain[corpsId] : Math.round(Number(lot[`${corpsId}_pct`] || 0));
      const nouveauPct = Math.min(100, Math.max(0, basePct + inc));
      mettreAJourCorpsTerrain(corpsId, nouveauPct);
    });
  });

  $('ch-contenu').querySelectorAll('[data-palier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [corpsId, targetStr] = btn.dataset.palier.split(':');
      mettreAJourCorpsTerrain(corpsId, Number(targetStr));
    });
  });

  $('ch-contenu').querySelectorAll('[data-photo-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      etat.tagPhotoActif = btn.dataset.photoTag;
      $('ch-contenu').querySelectorAll('[data-photo-tag]').forEach((b) => b.classList.toggle('actif', b === btn));
      if ($('terrain-tag-label')) $('terrain-tag-label').textContent = etat.tagPhotoActif;
    });
  });

  $('terrain-photo-input')?.addEventListener('change', ajouterPhotosTerrain);

  $('ch-contenu').querySelectorAll('[data-lever-terrain]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const resId = Number(btn.dataset.leverTerrain);
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await SIG.api('/api/reserves/' + resId + '/', { method: 'PATCH', body: { statut: 'levee' } });
        const item = $('terrain-res-item-' + resId);
        if (item) {
          item.classList.add('levee');
          item.style.display = 'none';
        }
      } catch (e) {
        APP.ui.toast('Erreur levée réserve : ' + e.message, { type: 'erreur' });
        btn.disabled = false;
        btn.textContent = '✓ Lever';
      }
    });
  });

  let graviteChoisie = 'mineure';
  $('terrain-btn-nouv-res')?.addEventListener('click', () => {
    const f = $('terrain-form-nouv-res');
    if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  $('ch-contenu').querySelectorAll('.ch-res-grav-btn').forEach((b) => {
    b.addEventListener('click', () => {
      graviteChoisie = b.dataset.grav;
      $('ch-contenu').querySelectorAll('.ch-res-grav-btn').forEach((x) => x.classList.toggle('actif', x === b));
    });
  });
  $('terrain-annuler-nouv-res')?.addEventListener('click', () => {
    const f = $('terrain-form-nouv-res');
    if (f) f.style.display = 'none';
  });
  $('terrain-confirmer-nouv-res')?.addEventListener('click', async () => {
    const desc = $('terrain-nouv-res-desc').value.trim();
    if (!desc) { APP.ui.toast('Veuillez saisir une description.', { type: 'erreur' }); return; }
    const btn = $('terrain-confirmer-nouv-res');
    btn.disabled = true;
    try {
      await SIG.api('/api/chantiers/' + encodeURIComponent(etat.lotTerrainActif) + '/reserves/', {
        method: 'POST',
        body: { description: desc, gravite: graviteChoisie, etape: etat.tagPhotoActif }
      });
      $('terrain-nouv-res-desc').value = '';
      $('terrain-form-nouv-res').style.display = 'none';
      btn.disabled = false;
      afficherModeTerrain(etat.lotTerrainActif);
    } catch (e) {
      APP.ui.toast('Erreur enregistrement réserve : ' + e.message, { type: 'erreur' });
      btn.disabled = false;
    }
  });

  $('terrain-btn-vocal-obs')?.addEventListener('click', function () {
    demarrerDictation('terrain-commentaire', this);
  });
  $('terrain-btn-vocal-res')?.addEventListener('click', function () {
    demarrerDictation('terrain-nouv-res-desc', this);
  });

  $('terrain-enregistrer-visite')?.addEventListener('click', () => enregistrerVisiteTerrain(lotSuivant));
}

export function mettreAJourCorpsTerrain(corpsId, nouveauPct) {
  etat.corpsModifiesTerrain[corpsId] = nouveauPct;
  const lot = etat.lotTerrainData || {};
  const budgetVal = Number(lot[`${corpsId}_budget`] || 0);
  const newMontant = Math.round(budgetVal * (nouveauPct / 100));

  const carte = $('terrain-carte-' + corpsId);
  if (carte) carte.classList.add('modifie');
  const txt = $('terrain-pct-txt-' + corpsId);
  if (txt) txt.textContent = num(nouveauPct) + ' %';
  const jauge = $('terrain-jauge-' + corpsId);
  if (jauge) jauge.style.width = Math.min(100, Math.max(0, nouveauPct)) + '%';
  const montEl = $('terrain-montant-' + corpsId);
  if (montEl) montEl.textContent = esc(fcfa(newMontant));

  carte?.querySelectorAll('[data-palier]').forEach((b) => {
    const t = Number(b.dataset.palier.split(':')[1]);
    b.classList.toggle('actif', t === nouveauPct);
  });

  let totalBudget = Number(lot.budget_finition || 0);
  let totalMontant = 0;
  CORPS_ETAT_KFE.forEach((c) => {
    const b = Number(lot[`${c.id}_budget`] || 0);
    const p = c.id in etat.corpsModifiesTerrain ? etat.corpsModifiesTerrain[c.id] : Number(lot[`${c.id}_pct`] || 0);
    totalMontant += b * (p / 100.0);
  });

  let newAvGlobal = 0;
  if (totalBudget > 0) {
    newAvGlobal = Math.round((totalMontant / totalBudget) * 100);
  } else {
    const sumPcts = CORPS_ETAT_KFE.reduce((acc, c) => acc + (c.id in etat.corpsModifiesTerrain ? etat.corpsModifiesTerrain[c.id] : Number(lot[`${c.id}_pct`] || 0)), 0);
    newAvGlobal = Math.round(sumPcts / CORPS_ETAT_KFE.length);
  }

  if ($('terrain-avancement-global-txt')) $('terrain-avancement-global-txt').textContent = num(newAvGlobal) + ' %';
  if ($('terrain-avancement-global-barre')) $('terrain-avancement-global-barre').style.width = Math.min(100, newAvGlobal) + '%';
}

export async function ajouterPhotosTerrain(e) {
  const fichiers = [...e.target.files];
  for (const file of fichiers) {
    try {
      const redim = await redimensionner(file);
      etat.photosTerrain.push({ fichier: redim, apercu: URL.createObjectURL(redim), categorie: etat.tagPhotoActif });
    } catch (err) {
      console.warn(err);
    }
  }
  dessinerGalerieTerrain();
}

export function dessinerGalerieTerrain() {
  const el = $('terrain-galerie');
  if (!el) return;
  el.innerHTML = etat.photosTerrain.map((p, i) => `
    <div class="ch-terrain-photo-vignette">
      <img src="${esc(p.apercu)}" alt="">
      <span class="ch-photo-tag-badge">${esc(p.categorie)}</span>
      <button type="button" class="ch-terrain-photo-del" data-del-photo="${i}" aria-label="Supprimer photo">×</button>
    </div>
  `).join('');

  el.querySelectorAll('[data-del-photo]').forEach((b) => {
    b.addEventListener('click', (e) => {
      const idx = Number(b.dataset.delPhoto);
      URL.revokeObjectURL(etat.photosTerrain[idx].apercu);
      etat.photosTerrain.splice(idx, 1);
      dessinerGalerieTerrain();
    });
  });
}

export async function enregistrerVisiteTerrain(lotSuivant) {
  const btn = $('terrain-enregistrer-visite');
  btn.disabled = true;
  const msgEl = $('terrain-msg');
  msgEl.className = 'note';
  msgEl.textContent = 'Enregistrement de la visite terrain…';

  const payload = {};
  CORPS_ETAT_KFE.forEach((c) => {
    if (c.id in etat.corpsModifiesTerrain) {
      payload[`${c.id}_pct`] = etat.corpsModifiesTerrain[c.id];
    }
  });
  const comm = $('terrain-commentaire')?.value.trim();
  if (comm) payload.commentaire = comm;

  try {
    await SIG.api('/api/chantiers/kfe/' + encodeURIComponent(etat.lotTerrainActif) + '/', {
      method: 'PATCH',
      body: payload
    });

    for (const p of etat.photosTerrain) {
      const fd = new FormData();
      fd.append('objet', 'chantier');
      fd.append('objet_id', String(etat.lotTerrainActif));
      fd.append('categorie', p.categorie || 'photo');
      fd.append('fichier', p.fichier);
      await SIG.api('/api/pieces/', { method: 'POST', body: fd }).catch((err) => console.warn('Erreur photo:', err));
    }

    msgEl.className = 'note succes';
    msgEl.textContent = `✓ Visite Villa ${etat.lotTerrainActif} enregistrée avec succès !`;

    etat.corpsModifiesTerrain = {};
    etat.photosTerrain = [];

    const autoSuivant = $('terrain-auto-suivant')?.checked;
    setTimeout(() => {
      if (autoSuivant && lotSuivant) {
        afficherModeTerrain(lotSuivant);
      } else {
        afficherModeTerrain(etat.lotTerrainActif);
      }
    }, 700);

  } catch (e) {
    msgEl.className = 'note erreur';
    msgEl.textContent = 'Erreur : ' + e.message;
    btn.disabled = false;
  }
}

afficheurs.terrain = afficherModeTerrain;
