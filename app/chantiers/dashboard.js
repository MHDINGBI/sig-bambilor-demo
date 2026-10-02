// Chantiers — Tableau de bord KFE 160 : synthèse + mini-carte d'avancement.
import { changerSousVue, dansMatrice, etat, fcfa, lienCarteKfe, MATRICE, trancheKfe, afficheurs } from './commun.js';
const { $, esc, num, pct, pl } = APP;

export async function afficherDashboard() {
  $('ch-vue').value = 'dashboard';
  $('ch-actions-fiche').hidden = true;
  $('ch-barre-filtres').hidden = true;
  $('ch-compteurs').hidden = true;
  $('ch-nouveau').hidden = true;

  if (!etat.statsKfe) {
    try {
      etat.statsKfe = await SIG.api('/api/chantiers/kfe/stats/');
    } catch (e) {
      $('ch-contenu').innerHTML = `<p class="note erreur">Tableau de bord KFE indisponible : ${esc(e.message)}</p>`;
      return;
    }
  }
  if (etat.sousVue !== 'dashboard') return; // sous-onglet changé pendant le chargement

  const gl = (etat.statsKfe || {}).global || {};
  const T = APP.tranchesKfe;
  const codesParTranche = new Map(T.map((t) => [t.k, []]));
  etat.kfeDonnees.forEach((k) => codesParTranche.get(trancheKfe(k.avancement_global || 0).k).push(k.code_lot));
  const codesMatrice = (cle) => etat.kfeDonnees.filter((k) => dansMatrice(k, cle)).map((k) => k.code_lot);
  const execute = gl.budget_total ? gl.montant_execute / gl.budget_total : 0;
  etat.tranchePointee = null;

  const tranchesHtml = T.map((t) => `
    <li><button type="button" class="ch-tranche" data-tranche="${t.k}" aria-pressed="false">
      <span class="pastille" style="background-color:${esc(t.c)}"></span>${esc(t.l)}
      <span class="compte">${num(codesParTranche.get(t.k).length)}</span></button></li>`).join('');

  const matriceHtml = MATRICE.map((m) => {
    const codes = codesMatrice(m.cle);
    return `
      <li class="ch-dash-ligne">
        <div><strong>${esc(m.titre)}</strong><span class="aide">${esc(m.aide)}</span></div>
        <span class="ch-dash-compte">${num(codes.length)}</span>
        <div class="ch-dash-liens">
          <button type="button" class="bouton secondaire petit" data-kfe-filter="${m.cle}">Liste</button>
          ${codes.length ? `<a class="bouton secondaire petit" href="${esc(lienCarteKfe(codes))}">Sur la carte&nbsp;→</a>` : ''}
        </div>
      </li>`;
  }).join('');

  $('ch-contenu').innerHTML = `
    <div class="ch-dash">
      <div class="ch-cockpit-kpis">
        <div class="ch-kpi-carte"><span class="c-etiquette">Avancement global</span><strong>${pct((gl.avancement_moyen || 0) / 100)}</strong>
          <p class="aide">${num(gl.total_villas || etat.kfeDonnees.length)} villas au contrat</p></div>
        <div class="ch-kpi-carte"><span class="c-etiquette">Budget exécuté</span><strong>${pct(execute)}</strong>
          <p class="aide">${esc(fcfa(gl.montant_execute))} sur ${esc(fcfa(gl.budget_total))}</p></div>
        <div class="ch-kpi-carte"><span class="c-etiquette">Villas achevées</span><strong>${num(gl.villas_achevees || 0)}</strong>
          <p class="aide">${num(gl.villas_en_cours || 0)} en cours</p></div>
        <div class="ch-kpi-carte"><span class="c-etiquette">Livrables prêts</span><strong>${num(codesMatrice('prets_remise').length)}</strong>
          <p class="aide">Chantier ≥ 90 % et compte soldé</p></div>
      </div>

      <div class="ch-dash-grille">
        <section class="bloc ch-dash-bloc" aria-labelledby="ch-dash-t-carte">
          <div class="ch-dash-entete">
            <div><span class="c-etiquette">Plan des villas KFE</span><h3 class="qc-h" id="ch-dash-t-carte">Avancement des finitions</h3></div>
            <a class="bouton" id="ch-dash-lien-carte" href="${esc(lienCarteKfe())}">Voir sur la carte&nbsp;→</a>
          </div>
          <div id="ch-minicarte" class="ch-minicarte" role="img" aria-label="Plan des villas KFE colorées selon leur avancement"></div>
          <p class="aide" id="ch-dash-portee" aria-live="polite"></p>
          <ul class="ch-tranches" id="ch-tranches">${tranchesHtml}</ul>
        </section>

        <section class="bloc ch-dash-bloc" aria-labelledby="ch-dash-t-matrice">
          <div class="ch-dash-entete"><div><span class="c-etiquette">Chantier × commercial</span><h3 class="qc-h" id="ch-dash-t-matrice">Décisions de livraison</h3></div></div>
          <ul class="ch-dash-lignes">${matriceHtml}</ul>
        </section>
      </div>
    </div>`;

  $('ch-contenu').querySelectorAll('[data-kfe-filter]').forEach((b) => {
    b.addEventListener('click', () => { etat.filtres.commercial = b.dataset.kfeFilter; changerSousVue('lots'); });
  });
  dessinerMiniCarte();
  $('ch-tranches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tranche]');
    if (!b) return;
    etat.tranchePointee = etat.tranchePointee === b.dataset.tranche ? null : b.dataset.tranche;
    majMiniCarte(codesParTranche);
  });
  majMiniCarte(codesParTranche);
}

export function dessinerMiniCarte() {
  if (etat.miniCarte) etat.miniCarte.remove();
  etat.miniCarte = L.map('ch-minicarte', {
    zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25,
  });
  const lots = new Map();
  const features = APP.features.filter((f) => etat.kfeMap.has(f.properties.code_lot));
  const couche = L.geoJSON(features, {
    style: (f) => styleMiniCarte(f.properties.code_lot),
    onEachFeature: (f, layer) => {
      const code = f.properties.code_lot;
      lots.set(code, layer);
      layer.bindTooltip(`Lot ${esc(code)} · ${pct((etat.kfeMap.get(code).avancement_global || 0) / 100)}`, { sticky: true });
      layer.on('click', () => { location.hash = '#carte/lot=' + encodeURIComponent(code) + '?theme=kfe_160'; });
    },
  }).addTo(etat.miniCarte);
  etat.miniCarte._lots = lots;
  if (features.length) etat.miniCarte.fitBounds(couche.getBounds(), { padding: [10, 10] });
  else etat.miniCarte.setView([14.72, -17.3], 15);
}

export function styleMiniCarte(code) {
  const t = trancheKfe(etat.kfeMap.get(code).avancement_global || 0);
  const actif = !etat.tranchePointee || t.k === etat.tranchePointee;
  return { fillColor: t.c, fillOpacity: actif ? 0.92 : 0.1, color: APP.jeton('--trait-fort'), weight: 0.5, opacity: actif ? 0.7 : 0.2 };
}

// Tranche mise en avant : atténue les autres lots, met à jour légende, texte et lien vers la grande carte (sans quitter la page)
export function majMiniCarte(codesParTranche) {
  if (!etat.miniCarte) return;
  etat.miniCarte._lots.forEach((layer, code) => layer.setStyle(styleMiniCarte(code)));
  document.querySelectorAll('#ch-tranches [data-tranche]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tranche === etat.tranchePointee)));
  const codes = etat.tranchePointee ? codesParTranche.get(etat.tranchePointee) : null;
  const t = etat.tranchePointee && APP.tranchesKfe.find((x) => x.k === etat.tranchePointee);
  $('ch-dash-portee').textContent = t
    ? `${pl(codes.length, 'villa', 'villas')} · ${t.l} — cliquer à nouveau pour tout afficher`
    : `${pl(etat.kfeMap.size, 'villa', 'villas')} · cliquer sur une tranche pour la mettre en avant`;
  $('ch-dash-lien-carte').setAttribute('href', lienCarteKfe(codes));
}

afficheurs.dashboard = afficherDashboard;
