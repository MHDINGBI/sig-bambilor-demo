// Chantiers — Détail d'un lot : fiche, frise, KFE, visites, réserves, photos + création chantier.
import { aRole, cfg, dateFr, ETAPE_QUICK, etat, fcfa, GRV, nav, redimensionner } from './commun.js';
const { $, esc, num, pct } = APP;

export async function chargerDetail(code) {
  $('ch-contenu').innerHTML = '<p class="vide">Chargement…</p>';
  try {
    const [resChantier, resKfe] = await Promise.all([
      SIG.api('/api/chantiers/' + encodeURIComponent(code) + '/'),
      SIG.api('/api/chantiers/kfe/?lot=' + encodeURIComponent(code)).catch(() => []),
    ]);
    etat.detail = resChantier;
    etat.detail.kfe = (resKfe && resKfe.length) ? resKfe[0] : etat.kfeMap.get(code);
    afficherDetail();
  } catch (e) {
    etat.detail = null;
    $('ch-contenu').innerHTML = `<p class="note erreur">Fiche indisponible : ${esc(e.message)}</p>`;
  }
}

export function barCorps(libelle, pctVal, bVal, mVal) {
  const val = Math.min(100, Math.max(0, Number(pctVal || 0)));
  const montants = (bVal != null && bVal > 0) ? `<span style="font-size:0.6875rem;color:var(--gris)">${esc(fcfa(mVal))} / ${esc(fcfa(bVal))}</span>` : '';
  return `
    <div class="kfe-mini-ligne">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span class="corps-nom">${esc(libelle)}</span>
        ${montants}
        <span class="corps-pct">${pct(val / 100)}</span>
      </div>
      <div class="kfe-mini-jauge"><span style="width:${val}%"></span></div>
    </div>`;
}

export function afficherDetail() {
  const detail = etat.detail;
  $('ch-vue').value = 'detail';
  $('ch-barre-filtres').hidden = true;
  $('ch-compteurs').hidden = true;
  $('ch-retour').hidden = false;
  $('ch-nouveau').hidden = true;
  const peutEcrire = aRole('conducteur');
  $('ch-actions-fiche').hidden = false;
  if ($('ch-copier') && detail) {
    $('ch-copier').dataset.lien = APP.lien('chantiers', detail.code_lot);
  }
  $('ch-visiter').hidden = !peutEcrire;
  const etatL = cfg().etats_travaux[detail.etat] || {};
  const kfe = detail.kfe;
  const av = kfe ? kfe.avancement_global : (detail.avancement || 0);

  let kfeBlocHtml = '';
  if (kfe) {
    const reliquatNum = Number(kfe.reliquat || 0);
    const estAlerte = (kfe.avancement_global >= 75 && reliquatNum > 0);
    kfeBlocHtml = `
      <div class="bloc kfe-fiche-bloc" style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h3 class="titre-section" style="margin:0"><span>Finitions KFE 160 · ${esc(kfe.lot_contrat)}</span></h3>
          <span class="badge-kfe" style="background:var(--accent);color:#fff">${esc(kfe.lot_contrat)}</span>
        </div>

        ${estAlerte ? `
          <div class="kfe-alerte-fiche">
            <strong>Alerte Recouvrement (Piste E) :</strong>
            <span>Chantier avancé à ${pct(kfe.avancement_global / 100)} mais reliquat impayé de <strong>${esc(fcfa(reliquatNum))}</strong> à régulariser avant livraison !</span>
          </div>` : ''}

        <dl class="fiche-dl ch-dl" style="margin:10px 0">
          <dt>Budget Finition</dt><dd>${esc(fcfa(kfe.budget_finition))}</dd>
          <dt>Montant Exécuté</dt><dd><strong>${esc(fcfa(kfe.montant_execute))}</strong></dd>
          <dt>Acquéreur</dt><dd>${esc(kfe.acquereur_nom || 'Non réservé')}</dd>
          <dt>Statut Compte</dt><dd>${kfe.compte_solde ? '<span style="color:var(--succes);font-weight:700">Soldé (100%)</span>' : (reliquatNum > 0 ? `<span style="color:var(--alerte);font-weight:700">Reliquat : ${esc(fcfa(reliquatNum))}</span>` : '—')}</dd>
        </dl>

        <h4 style="font-size:0.8125rem;text-transform:uppercase;letter-spacing:.08em;color:var(--gris);margin:14px 0 8px">Avancement des 7 Corps d'État KFE</h4>
        <div class="kfe-corps-jauges">
          ${barCorps('1. Gros œuvre', kfe.gros_oeuvre_pct, kfe.gros_oeuvre_budget, kfe.gros_oeuvre_montant)}
          ${barCorps('2. Étanchéité', kfe.etancheite_pct, kfe.etancheite_budget, kfe.etancheite_montant)}
          ${barCorps('3. Carrelage', kfe.carrelage_pct, kfe.carrelage_budget, kfe.carrelage_montant)}
          ${barCorps('4. Menuiserie', kfe.menuiserie_pct, kfe.menuiserie_budget, kfe.menuiserie_montant)}
          ${barCorps('5. Plomberie', kfe.plomberie_pct, kfe.plomberie_budget, kfe.plomberie_montant)}
          ${barCorps('6. Électricité', kfe.electricite_pct, kfe.electricite_budget, kfe.electricite_montant)}
          ${barCorps('7. Peinture', kfe.peinture_pct, kfe.peinture_budget, kfe.peinture_montant)}
        </div>
      </div>`;
  }

  const reserveHtml = detail.reserves?.length ? detail.reserves.slice().sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === 'ouverte' ? -1 : 1;
    const g = { bloquante: 0, majeure: 1, mineure: 2 };
    return (g[a.gravite] || 3) - (g[b.gravite] || 3);
  }).map((r) => {
    const g = GRV[r.gravite] || GRV.mineure;
    const ouverte = r.statut === 'ouverte';
    return `<li class="ch-reserve-${esc(g.classe)} ${esc(r.statut)}">
      <div><strong>${esc(r.etape)}</strong><span class="ch-gravite ${esc(g.classe)}">${esc(g.libelle)}</span></div>
      <p>${esc(r.description)}</p>
      <span class="ch-meta">Ouverte ${dateFr(r.ouverte_le)}${r.par ? ' · ' + esc(r.par) : ''}</span>
      ${ouverte && peutEcrire ? `<button type="button" class="bouton secondaire" data-lever="${num(r.id)}">Lever</button>` : ''}
    </li>`;
  }).join('') : '<p class="vide">Aucune réserve.</p>';

  const visitesHtml = detail.visites?.length ? detail.visites.map((v) =>
    `<li${APP.ancre('rapport', v.id, `Rapport de visite du ${dateFr(v.le)}`)}><span class="h-date">${dateFr(v.le)} · ${esc(v.par || '—')}</span>${esc(v.commentaire || '')}<span class="ch-av-visite">Avancement global ${pct((v.avancement_global || 0) / 100)}</span></li>`
  ).join('') : '<p class="vide">Aucune visite enregistrée.</p>';

  const photosHtml = detail.photos?.length ? detail.photos.map((p) =>
    `<a href="${esc(APP.url(p.url))}" target="_blank" class="ch-photo"${APP.ancre('photo', p.id, `Photo du ${dateFr(p.le)}`)} aria-label="Photo du ${dateFr(p.le)}"><img src="${esc(APP.url(p.url))}" alt="" loading="lazy"></a>`
  ).join('') : '<p class="vide">Aucune photo.</p>';

  const etapesHtml = detail.etapes?.map((e) => {
    const constate = !e.estime;
    return `<li class="${constate ? 'constate' : 'estime'}"${APP.ancre('etape', e.etape, `Étape ${e.libelle || e.etape}`)}>
      <div class="ch-frise-tete"><strong>${esc(e.libelle || e.etape)}</strong><span>${esc(e.poids)} % · ${pct((e.avancement || 0) / 100)}</span></div>
      ${!constate ? '<span class="ch-pastille estime">Estimé</span>' : ''}
      ${e.commentaire ? `<p>${esc(e.commentaire)}</p>` : ''}
    </li>`;
  }).join('') || '<p class="vide">Aucune étape.</p>';

  $('ch-contenu').innerHTML = `
    <div class="ch-detail">
      <div class="bloc ch-tete">
        <div>
          <span class="c-etiquette">Chantier · lot ${esc(detail.code_lot)}</span>
          <h2 class="ch-titre">Lot ${esc(detail.code_lot)}</h2>
          <p class="ch-sous-titre">${esc(detail.phase)} · ${esc(detail.type_villa)} · ${esc(etatL.libelle || detail.etat)}</p>
        </div>
        <div class="ch-tete-actions">
          <button type="button" class="bouton secondaire btn-copier-lien" data-lien="${esc(APP.lien('chantiers', detail.code_lot))}" title="Copier le lien direct vers ce chantier">🔗 Lien</button>
          <a href="#carte/lot=${esc(encodeURIComponent(detail.code_lot))}" class="bouton secondaire">Voir sur la carte</a>
          <button type="button" id="ch-visiter" class="bouton">Nouvelle visite</button>
        </div>
      </div>
      <div class="ch-rangee">
        <div class="bloc">
          <div class="ch-jauge-bloc"${APP.ancre('champ', 'avancement', `Lot ${detail.code_lot} — Avancement global`)}>
            <span class="c-etiquette">Avancement global ${kfe ? '(KFE)' : ''}</span>
            <strong>${pct(av / 100)}</strong>
            <div class="jauge"><span style="width:${Math.min(100, av)}%;background:${esc(etatL.couleur || APP.jeton('--accent'))}"></span></div>
            ${detail.retard_jours ? `<span class="ch-retard-grand">${num(detail.retard_jours)} jours de retard</span>` : ''}
          </div>
          <dl class="fiche-dl ch-dl">
            <dt>Entreprise</dt><dd>${esc(detail.entreprise || '—')}</dd>
            <dt>Conducteur</dt><dd>${esc(detail.conducteur || '—')}</dd>
            <dt>Fin prévue</dt><dd>${dateFr(detail.fin_prevue)}</dd>
            <dt>Dernière visite</dt><dd>${dateFr(detail.derniere_visite) || '—'}</dd>
          </dl>
        </div>
        <div class="bloc">
          <h3 class="titre-section"><span>Frise des étapes standard</span></h3>
          <ol class="ch-frise">${etapesHtml}</ol>
        </div>
      </div>

      ${kfeBlocHtml}

      <div class="bloc">
        <h3 class="titre-section"><span>Historique des visites</span></h3>
        <div class="ch-graph" id="ch-graph-visites"></div>
        <ul class="historique">${visitesHtml}</ul>
      </div>
      <div class="bloc">
        <h3 class="titre-section"><span>Réserves</span></h3>
        <ul class="ch-reserves">${reserveHtml}</ul>
      </div>
      <div class="bloc">
        <h3 class="titre-section"><span>Photos</span></h3>
        <div class="ch-photos">${photosHtml}</div>
      </div>
    </div>`;

  APP.collab?.ouvrir({
    type: 'chantier', id: detail.code_lot, libelle: 'Lot ' + detail.code_lot,
    conteneur: $('ch-contenu'), entete: $('ch-contenu').querySelector('.ch-tete-actions'),
  });

  initGraphVisites();
  $('ch-visiter')?.addEventListener('click', ouvrirVisite);
  $('ch-contenu').querySelectorAll('[data-lever]').forEach((b) => b.addEventListener('click', leverReserve));
}

export function initGraphVisites() {
  const el = $('ch-graph-visites');
  if (!el || !etat.detail?.visites?.length) { if (el) el.innerHTML = '<p class="aide">Pas assez d’historique pour le graphique.</p>'; return; }
  if (etat.graph) { etat.graph.dispose(); etat.graph = null; }
  const data = [...etat.detail.visites].sort((a, b) => String(a.le).localeCompare(String(b.le)));
  etat.graph = echarts.init(el, null, { renderer: 'svg' });
  const option = {
    grid: { top: 24, right: 16, bottom: 24, left: 40 },
    tooltip: { trigger: 'axis', formatter: (p) => `${dateFr(p[0].axisValue)}<br/>${p[0].marker} ${p[0].value} %` },
    xAxis: { type: 'category', data: data.map((v) => v.le), axisLabel: { formatter: (v) => dateFr(v) } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value} %' } },
    series: [{
      data: data.map((v) => v.avancement_global || 0),
      type: 'line',
      smooth: true,
      symbolSize: 8,
      lineStyle: { color: APP.jeton('--accent'), width: 3 },
      itemStyle: { color: APP.jeton('--accent') },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: APP.jeton('--accent') + '55' }, { offset: 1, color: APP.jeton('--accent') + '00' }]) },
    }],
  };
  etat.graph.setOption(option);
  new ResizeObserver(() => etat.graph && etat.graph.resize()).observe(el);
}

export function ouvrirVisite() {
  const detail = etat.detail;
  etat.photosVisite = [];
  const etapesHtml = (detail.etapes || []).map((e, idx) => `
    <div class="ch-etape-visite">
      <label for="ch-etape-${idx}">${esc(e.libelle || e.etape)} <span class="ch-poids">${esc(e.poids)} %</span></label>
      <div class="ch-slider-ligne">
        <input type="range" id="ch-etape-${idx}" data-etape="${esc(e.etape)}" min="0" max="100" step="5" value="${num(e.avancement || 0)}">
        <output for="ch-etape-${idx}" id="ch-out-${idx}">${num(e.avancement || 0)} %</output>
      </div>
      <div class="ch-quick">
        ${ETAPE_QUICK.map((v) => `<button type="button" class="bouton secondaire" data-set="${idx}:${num(v)}">${num(v)} %</button>`).join('')}
      </div>
    </div>
  `).join('');

  $('ch-contenu').innerHTML = `
    <div class="ch-form-visite">
      <div class="bloc">
        <span class="c-etiquette">Nouvelle visite · lot ${esc(detail.code_lot)}</span>
        <h2>Visite du ${dateFr(new Date().toISOString().slice(0, 10))}</h2>
      </div>
      <div class="bloc">
        <h3 class="titre-section"><span>Avancement par étape</span></h3>
        ${etapesHtml}
      </div>
      <div class="bloc">
        <label for="ch-commentaire" class="c-etiquette">Commentaire</label>
        <textarea id="ch-commentaire" rows="3" placeholder="Constat, météo, matériel…"></textarea>
      </div>
      <div class="bloc">
        <h3 class="titre-section"><span>Photos</span></h3>
        <label class="bouton ch-photo-bouton">
          <input type="file" id="ch-photos" accept="image/*" capture="environment" multiple>
          Prendre / ajouter des photos
        </label>
        <div id="ch-apercus" class="ch-apercus"></div>
      </div>
      <div class="bloc" id="ch-nouvelles-reserves">
        <h3 class="titre-section"><span>Réserves à lever / nouvelles</span></h3>
        <div id="ch-reserves-existantes">${detail.reserves?.filter((r) => r.statut === 'ouverte').map((r) =>
          `<label class="ch-res-ligne"><input type="checkbox" data-lever="${num(r.id)}"> Lever : ${esc(r.description)}</label>`
        ).join('') || '<p class="aide">Aucune réserve ouverte.</p>'}</div>
        <button type="button" id="ch-ajouter-reserve" class="bouton secondaire">Ajouter une réserve</button>
        <div id="ch-reserves-a-ajouter" class="ch-reserves-a-ajouter"></div>
      </div>
      <div class="ch-barre-envoi">
        <div id="ch-msg"></div>
        <div class="ch-progress"><div id="ch-progress-bar"></div></div>
        <button type="button" id="ch-enregistrer" class="bouton">Enregistrer la visite</button>
        <button type="button" id="ch-annuler" class="bouton secondaire">Annuler</button>
      </div>
    </div>`;
  // Le formulaire remplace la fiche : on y remonte pile et bandeau pour garder l'avertissement de conflit.
  APP.collab?.ouvrir({
    type: 'chantier', id: detail.code_lot, libelle: 'Lot ' + detail.code_lot,
    conteneur: $('ch-contenu'), entete: $('ch-contenu').querySelector('.ch-form-visite h2'),
  });

  $('ch-contenu').querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = e.target.id.split('-')[2];
      $('ch-out-' + idx).textContent = num(e.target.value) + ' %';
    });
  });
  $('ch-contenu').querySelectorAll('[data-set]').forEach((b) => {
    b.addEventListener('click', (e) => {
      const [idx, val] = e.target.dataset.set.split(':');
      $('ch-etape-' + idx).value = val;
      $('ch-out-' + idx).textContent = num(val) + ' %';
    });
  });
  $('ch-photos').addEventListener('change', ajouterPhotos);
  $('ch-ajouter-reserve').addEventListener('click', ajouterReserveInput);
  $('ch-enregistrer').addEventListener('click', enregistrerVisite);
  $('ch-annuler').addEventListener('click', () => afficherDetail());
}

export function ajouterReserveInput() {
  const id = Date.now();
  const etapes = (etat.detail.etapes || []).map((e) => `<option value="${esc(e.etape)}">${esc(e.libelle || e.etape)}</option>`).join('');
  const div = document.createElement('div');
  div.className = 'ch-reserve-form';
  div.innerHTML = `
    <label>Étape<select id="ch-res-etape-${id}">${etapes}</select></label>
    <label>Description<input type="text" id="ch-res-desc-${id}" placeholder="Ex. fissure façade"></label>
    <label>Gravité<select id="ch-res-grav-${id}"><option value="mineure">Mineure</option><option value="majeure">Majeure</option><option value="bloquante">Bloquante</option></select></label>
    <button type="button" class="bouton secondaire" data-retirer="${id}">Retirer</button>`;
  $('ch-reserves-a-ajouter').appendChild(div);
  div.querySelector('[data-retirer]').addEventListener('click', () => div.remove());
}

export async function ajouterPhotos(e) {
  const fichiers = [...e.target.files];
  for (const file of fichiers) {
    try {
      const redimensionnee = await redimensionner(file);
      etat.photosVisite.push({ fichier: redimensionnee, apercu: URL.createObjectURL(redimensionnee) });
    } catch (err) {
      msg(`Photo ${esc(file.name)} ignorée : ${esc(err.message)}`, true);
    }
  }
  dessinerApercus();
}

export function dessinerApercus() {
  $('ch-apercus').innerHTML = etat.photosVisite.map((p, i) =>
    `<div class="ch-apercu"><img src="${esc(p.apercu)}" alt=""><button type="button" class="ch-retirer-photo" data-index="${i}" aria-label="Retirer la photo">×</button></div>`
  ).join('');
  $('ch-apercus').querySelectorAll('[data-index]').forEach((b) => b.addEventListener('click', (e) => {
    const idx = Number(e.target.dataset.index);
    URL.revokeObjectURL(etat.photosVisite[idx].apercu);
    etat.photosVisite.splice(idx, 1);
    dessinerApercus();
  }));
}

export async function enregistrerVisite() {
  const detail = etat.detail;
  const btn = $('ch-enregistrer');
  btn.disabled = true;
  msg('');
  try {
    const etapes = [...$('ch-contenu').querySelectorAll('input[type="range"][data-etape]')].map((i) => ({
      etape: i.dataset.etape, avancement: Number(i.value), commentaire: null,
    }));
    const commentaire = $('ch-commentaire').value.trim() || null;
    const le = new Date().toISOString().slice(0, 10);
    const payload = { le, commentaire, etapes };
    const base = '/api/chantiers/' + encodeURIComponent(detail.code_lot);
    progress(10);
    const res = await SIG.api(base + '/visites/', { method: 'POST', body: payload });
    progress(30);
    const visiteId = res?.visite?.id;
    const codeLot = detail.code_lot;
    if (SIG.DEV) {
      msg('Mode démo : visite simulée.');
      document.dispatchEvent(new Event('collab:enregistre'));
      setTimeout(() => { etat.detail = null; chargerDetail(codeLot); }, 1200);
      return;
    }
    if (!visiteId) throw new Error('identifiant de visite manquant');
    for (let i = 0; i < etat.photosVisite.length; i++) {
      const fd = new FormData();
      fd.append('objet', 'visite');
      fd.append('objet_id', String(visiteId));
      fd.append('categorie', 'photo');
      fd.append('fichier', etat.photosVisite[i].fichier);
      await SIG.api('/api/pieces/', { method: 'POST', body: fd });
      progress(30 + Math.round(((i + 1) / etat.photosVisite.length) * 40));
    }
    const levees = [...$('ch-reserves-existantes').querySelectorAll('input[data-lever]:checked')].map((i) => Number(i.dataset.lever));
    for (const id of levees) {
      await SIG.api('/api/reserves/' + id + '/', { method: 'PATCH', body: { statut: 'levee' } });
    }
    const nouvelles = [...$('ch-reserves-a-ajouter').children].map((d) => ({
      etape: d.querySelector('select').value,
      description: d.querySelector('input').value.trim(),
      gravite: d.querySelectorAll('select')[1].value,
    })).filter((r) => r.description);
    for (const r of nouvelles) {
      await SIG.api(base + '/reserves/', { method: 'POST', body: r });
    }
    progress(100);
    msg('Visite enregistrée.');
    document.dispatchEvent(new Event('collab:enregistre'));
    setTimeout(() => { etat.detail = null; chargerDetail(codeLot); }, 800);
  } catch (e) {
    msg('Erreur : ' + e.message, true);
    btn.disabled = false;
  }
}

export async function leverReserve(e) {
  const id = Number(e.target.dataset.lever);
  const codeLot = etat.detail.code_lot;
  try {
    await SIG.api('/api/reserves/' + id + '/', { method: 'PATCH', body: { statut: 'levee' } });
    document.dispatchEvent(new Event('collab:enregistre'));
    etat.detail = null;
    chargerDetail(codeLot);
  } catch (err) {
    msg('Erreur : ' + err.message, true);
  }
}

function progress(pct) {
  const bar = $('ch-progress-bar');
  if (bar) bar.style.width = Math.min(100, pct) + '%';
}

function msg(texte, erreur) {
  const el = $('ch-msg');
  if (!el) return;
  el.textContent = texte;
  el.className = erreur ? 'msg erreur' : texte ? 'msg succes' : '';
}

export function ouvrirNouveauChantier() {
  $('ch-vue').value = 'nouveau';
  $('ch-retour').hidden = false;
  $('ch-nouveau').hidden = true;
  $('ch-actions-fiche').hidden = true;
  const types = (cfg().types_villa || []).map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('ch-contenu').innerHTML = `
    <div class="ch-form-chantier bloc">
      <span class="c-etiquette">Nouveau chantier</span>
      <h2>Créer un chantier</h2>
      <div class="formulaire">
        <label>N° de lot<input type="text" id="ch-new-lot" inputmode="numeric" placeholder="Ex. 1001"></label>
        <label>Entreprise<input type="text" id="ch-new-entreprise"></label>
        <label>Conducteur<input type="text" id="ch-new-conducteur" value="${esc(APP.me?.username || '')}"></label>
        <label>Type de villa<select id="ch-new-type">${types}</select></label>
        <label>Devis TTC<input type="number" id="ch-new-devis" min="0" step="1000"></label>
        <label>Début prévu<input type="date" id="ch-new-debut"></label>
        <label>Fin prévue<input type="date" id="ch-new-fin"></label>
        <div id="ch-new-msg"></div>
        <div class="actions">
          <button type="button" id="ch-new-enregistrer" class="bouton">Créer le chantier</button>
          <button type="button" id="ch-new-annuler" class="bouton secondaire">Annuler</button>
        </div>
      </div>
    </div>`;
  $('ch-new-enregistrer').addEventListener('click', enregistrerChantier);
  $('ch-new-annuler').addEventListener('click', () => { nav('#chantiers'); });
}

export async function enregistrerChantier() {
  const btn = $('ch-new-enregistrer');
  btn.disabled = true;
  const msgEl = $('ch-new-msg');
  msgEl.className = '';
  msgEl.textContent = '';
  try {
    const body = {
      code_lot: $('ch-new-lot').value.trim(),
      entreprise: $('ch-new-entreprise').value.trim() || null,
      conducteur: $('ch-new-conducteur').value.trim() || null,
      type_villa: $('ch-new-type').value,
      devis_ttc: Number($('ch-new-devis').value) || 0,
      debut_prevu: $('ch-new-debut').value || null,
      fin_prevue: $('ch-new-fin').value || null,
    };
    if (!body.code_lot) throw new Error('Le n° de lot est obligatoire.');
    const res = await SIG.api('/api/chantiers/', { method: 'POST', body });
    msgEl.textContent = SIG.DEV ? 'Mode démo : chantier simulé.' : 'Chantier créé.';
    msgEl.className = 'msg succes';
    setTimeout(() => { nav('#chantiers/lot=' + encodeURIComponent(res?.code_lot || body.code_lot)); }, 800);
  } catch (e) {
    msgEl.textContent = 'Erreur : ' + e.message;
    msgEl.className = 'msg erreur';
    btn.disabled = false;
  }
}
