// Onglet Carte — fonds, couches, thématiques + légende, étiquettes, recherche, fiche lot, édition (technicien), exports.
(function () {
  const { $, esc, num, pct } = APP;
  // Couleurs lues dans le thème courant (clair / sombre) : lots sans valeur, accent, phases (--ph1…--ph6)
  const VIDE = () => APP.jeton('--vide-carte');
  const ACCENT = () => APP.jeton('--accent');
  const PHASE = (i) => (i < 6 && APP.jeton('--ph' + (i + 1))) || APP.jeton('--gris');
  // Rampe séquentielle mono-teinte pour le taux d'exécution
  const TRANCHES = [
    { k: 't0', max: 0, l: '0 %', c: '#cde2fb' },
    { k: 't1', max: 0.25, l: '1 à 25 %', c: '#86b6ef' },
    { k: 't2', max: 0.5, l: '26 à 50 %', c: '#3987e5' },
    { k: 't3', max: 0.75, l: '51 à 75 %', c: '#1c5cab' },
    { k: 't4', max: Infinity, l: '76 à 100 %', c: '#0d366b' },
  ];
  const LIBELLES = {
    code_lot: 'Code lot', num_lot_plan: 'N° sur le plan', nom_phase: 'Phase', type_villa: 'Type de villa', typologie: 'Typologie',
    surface_m2: 'Surface calculée', surface_plan: 'Surface au plan', perimetre_contractuel: 'Périmètre contractuel',
  };

  const TRANCHES_KFE = [
    { k: 'k0', max: 0, l: '0 % (Non démarré)', c: '#b2bec3' },
    { k: 'k1', max: 25, l: '1 à 25 % (Démarrage)', c: '#ffeaa7' },
    { k: 'k2', max: 50, l: '26 à 50 % (En cours)', c: '#74b9ff' },
    { k: 'k3', max: 75, l: '51 à 75 % (Avancé)', c: '#0984e3' },
    { k: 'k4', max: 90, l: '76 à 90 % (Finition)', c: '#55efc4' },
    { k: 'k5', max: 99.9, l: '91 à 99 % (Pré-réception)', c: '#00cec9' },
    { k: 'k6', max: Infinity, l: '100 % (Achevé)', c: '#006266' },
  ];

  let carte, couche, parCode = new Map(), etiquettes, fonds, extras = {}, theme = 'etat_travaux', corpsKfe = 'global';
  let vu = -1, recadrer = true, selection = null, groupe = [], fantome = null, jetonFiche = 0, clicCarte = false;
  const cfg = () => APP.cfg;

  // ---------- thématiques ----------
  function categories() {
    const c = cfg();
    const depuis = (src, vide) => [...Object.entries(src).map(([k, v]) => ({ k, l: v.libelle, c: APP.couleur(v.couleur) })), { k: null, l: vide, c: VIDE() }];
    if (theme === 'etat_travaux') return depuis(c.etats_travaux, 'Sans suivi de travaux');
    if (theme === 'kfe_160') return [...TRANCHES_KFE, { k: null, l: 'Hors périmètre KFE 160', c: 'rgba(180, 180, 180, 0.22)' }];
    if (theme === 'statut_commercial') return depuis(c.statuts_commerciaux, 'Statut non renseigné');
    if (theme === 'phase') return [...c.phases.map((p, i) => ({ k: p.code, l: p.nom, c: PHASE(i) })), { k: null, l: 'Hors phase', c: VIDE() }];
    // types de villa : même palette que les phases (config.yml ne porte pas de couleur par type)
    if (theme === 'type_villa') return [...c.types_villa.map((t, i) => ({ k: t, l: t, c: PHASE(i) })), { k: null, l: 'Type inconnu', c: VIDE() }];
    return [...TRANCHES, { k: null, l: 'Sans taux d’exécution', c: VIDE() }];
  }
  function cle(p) {
    if (theme === 'etat_travaux') return p.etat_travaux || null;
    if (theme === 'kfe_160') {
      if (!p.kfe_lot_contrat && p.kfe_avancement == null) return null;
      const v = corpsKfe === 'global' ? p.kfe_avancement : p['kfe_' + corpsKfe];
      if (v == null) return null;
      return (TRANCHES_KFE.find((t) => Number(v) <= t.max) || TRANCHES_KFE[TRANCHES_KFE.length - 1]).k;
    }
    if (theme === 'statut_commercial') return p.statut_commercial || null;
    if (theme === 'phase') return p.code_phase || null;
    if (theme === 'type_villa') return p.type_villa || null;
    return p.taux_execution == null ? null : TRANCHES.find((t) => p.taux_execution <= t.max).k;
  }
  let cats = new Map();
  const couleur = (p) => (cats.get(cle(p)) || { c: VIDE() }).c;
  let trait = '#FFFFFF';
  const style = (f) => ({ color: trait, weight: 0.7, opacity: 0.95, fillColor: couleur(f.properties), fillOpacity: 0.88 });

  function legende() {
    const n = new Map();
    APP.features.forEach((f) => { const k = cle(f.properties); n.set(k, (n.get(k) || 0) + 1); });
    $('legende-carte').innerHTML = categories().filter((c) => n.get(c.k))
      .map((c) => `<li><span class="pastille" style="background-color:${esc(c.c)}"></span>${esc(c.l)} <span class="compte">${num(n.get(c.k))}</span></li>`)
      .join('') || '<li>Aucun lot pour ces filtres.</li>';
  }
  function changerTheme() {
    theme = document.querySelector('input[name="theme"]:checked').value;
    const panneauKfe = $('kfe-corps-panneau');
    if (panneauKfe) panneauKfe.hidden = (theme !== 'kfe_160');
    trait = APP.jeton('--papier');
    cats = new Map(categories().map((c) => [c.k, c]));
    if (couche) couche.setStyle(style);
    marquerSelection();
    legende();
  }

  // ---------- initialisation (au premier affichage : le conteneur doit être visible) ----------
  function init() {
    carte = L.map('carte', { zoomControl: false, preferCanvas: true, maxZoom: 22 })
      .setView(cfg().projet.centre_carte, cfg().projet.zoom_initial);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Zoom avant', zoomOutTitle: 'Zoom arrière' }).addTo(carte);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(carte);
    fonds = {
      osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 19, className: 'fond-osm', attribution: '&copy; contributeurs OpenStreetMap' }),
      esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 22, maxNativeZoom: 19, attribution: 'Imagerie &copy; Esri' }),
    };
    fonds.osm.addTo(carte);
    carte.createPane('dessous').style.zIndex = 350; // couches de contexte sous les parcelles
    etiquettes = L.layerGroup().addTo(carte);
    carte.on('moveend', majEtiquettes);

    document.querySelectorAll('input[name="fond"]').forEach((i) => i.addEventListener('change', () => {
      Object.entries(fonds).forEach(([k, l]) => (k === i.value ? l.addTo(carte) : l.remove()));
    }));
    document.querySelectorAll('input[name="couche"]').forEach((i) => i.addEventListener('change', () => basculerCouche(i.value, i.checked)));
    document.querySelectorAll('input[name="theme"]').forEach((i) => i.addEventListener('change', changerTheme));
    $('kfe-corps-select')?.addEventListener('change', (e) => {
      corpsKfe = e.target.value;
      changerTheme();
    });
    $('recherche').addEventListener('submit', rechercher);
    $('export-geojson').addEventListener('click', () => exporter('geojson'));
    $('export-csv').addEventListener('click', () => exporter('csv'));
    $('fermer-fiche').addEventListener('click', fermerFiche);
    $('fiche-corps').addEventListener('click', (e) => {
      const b = e.target.closest('[data-doc]');
      if (b) APP.clients.ouvrirPage(Number(b.dataset.doc), Number(b.dataset.page || 1));
      const r = e.target.closest('[data-releve]');
      if (r) APP.clients.releve(r.dataset.releve);
    });
    $('basculer-outils').addEventListener('click', () => ouvrirOutils(!$('outils').classList.contains('ouvert')));
    ouvrirOutils(matchMedia('(min-width: 768px)').matches);
    changerTheme();
    basculerCouche('zones_phase', true);
  }

  function ouvrirOutils(ouvert) {
    $('outils').classList.toggle('ouvert', ouvert);
    $('basculer-outils').setAttribute('aria-expanded', ouvert);
    $('basculer-outils').textContent = ouvert ? 'Masquer le panneau' : 'Légende et outils';
  }

  const STYLES_EXTRAS = () => ({
    zones_phase: { color: ACCENT(), weight: 2, dashArray: '6 4', fill: false },
    voirie: { color: APP.jeton('--gris'), weight: 2, opacity: 0.8 },
    equipements: { color: APP.jeton('--gris'), weight: 1, fillColor: APP.jeton('--trait-fort'), fillOpacity: 0.5 },
  });
  async function basculerCouche(nom, visible) {
    if (nom === 'parcelles') { if (couche) (visible ? couche.addTo(carte) : couche.remove()); majEtiquettes(); return; }
    if (!visible) { if (extras[nom]) extras[nom].remove(); return; }
    try {
      if (!extras[nom]) {
        const fc = await SIG.api(`/api/layers/${nom}/`);
        extras[nom] = L.geoJSON(fc, { pane: 'dessous', interactive: false, style: STYLES_EXTRAS()[nom] });
      }
      if (document.querySelector(`input[name="couche"][value="${nom}"]`).checked) extras[nom].addTo(carte);
    } catch (e) {
      $('etat-couches').textContent = 'Couche indisponible : ' + e.message;
    }
  }

  // ---------- affichage ----------
  function afficher(route) {
    if (!carte) init();
    carte.invalidateSize();
    if (vu !== APP.version) {
      vu = APP.version;
      dessinerCouche();
    }
    // #carte?theme=kfe_160 : ouvre la carte directement sur une thématique (lien depuis le tableau de bord KFE)
    const themeDemande = route && route.qs && new URLSearchParams(route.qs).get('theme');
    const radioTheme = themeDemande && document.querySelector(`input[name="theme"][value="${themeDemande}"]`);
    if (radioTheme && !radioTheme.checked) { radioTheme.checked = true; changerTheme(); }
    if (route) {
      if (route.lot && route.cle === 'lots') focaliserGroupe(route.lot.split(',').filter(Boolean));
      else if (route.lot) focaliser(route.lot);
      else if (selection || groupe.length) fermerFiche(false);
    }
  }

  function dessinerCouche() {
    if (edition) annulerGeometrie();
    if (couche) couche.remove();
    parCode = new Map();
    couche = L.geoJSON(APP.features, {
      style,
      onEachFeature: (f, layer) => {
        parCode.set(f.properties.code_lot, layer);
        layer.on('click', () => {
          const h = APP.lien('carte', f.properties.code_lot);
          if (edition || location.hash === h) return;
          clicCarte = true; // lot déjà visible : pas de recadrage
          location.hash = h;
        });
      },
    });
    if (document.querySelector('input[name="couche"][value="parcelles"]').checked) couche.addTo(carte);
    if (recadrer && APP.features.length && !([selection, ...groupe].some((c) => parCode.has(c)))) carte.fitBounds(couche.getBounds(), { paddingTopLeft: [matchMedia('(min-width: 768px)').matches && $('outils').classList.contains('ouvert') ? 330 : 24, 24], paddingBottomRight: [24, 24] });
    recadrer = true; // chaque changement de filtre recadre sur les lots affichés
    marquerSelection();
    legende();
    majEtiquettes();
  }

  // Numéros des lots visibles, à partir du zoom 18
  function majEtiquettes() {
    etiquettes.clearLayers();
    if (!couche || !carte.hasLayer(couche) || carte.getZoom() < 18) return;
    const b = carte.getBounds();
    couche.eachLayer((layer) => {
      const lb = layer.getBounds();
      if (!b.intersects(lb)) return;
      const p = layer.feature.properties;
      L.marker(lb.getCenter(), {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'etiquette-lot', html: esc(p.num_lot_plan || p.code_lot), iconSize: [48, 16], iconAnchor: [24, 8] }),
      }).addTo(etiquettes);
    });
  }

  function marquerSelection() {
    if (!couche) return;
    parCode.forEach((layer, code) => { if (code === selection || groupe.includes(code)) { layer.setStyle({ color: ACCENT(), weight: 3.5, opacity: 1 }); layer.bringToFront(); } });
  }

  // Zoom raisonnable sur un lot, en laissant la place à la fiche
  function cadrer(bounds) {
    const large = matchMedia('(min-width: 768px)').matches, gauche = large && $('outils').classList.contains('ouvert') ? 330 : 60;
    carte.fitBounds(bounds, { maxZoom: 19, paddingTopLeft: [gauche, 60], paddingBottomRight: [large ? 440 : 60, large ? 60 : Math.round(innerHeight * 0.45)] });
  }

  // Retire le surlignage du lot ou du groupe sélectionné
  function effacerMarques() {
    [selection, ...groupe].forEach((c) => { const l = parCode.get(c); if (l) couche.resetStyle(l); });
    selection = null;
    groupe = [];
  }

  function focaliser(code) {
    if (selection !== code || groupe.length) {
      effacerMarques();
      selection = code;
      marquerSelection();
    }
    if (fantome) { fantome.remove(); fantome = null; }
    const layer = parCode.get(code);
    if (layer && !clicCarte) cadrer(layer.getBounds());
    clicCarte = false;
    ouvrirFiche(code, !!layer);
  }

  // Plusieurs lots à la fois (ex. tous les lots d'un acquéreur) : surlignés ensemble, carte cadrée sur l'ensemble
  function focaliserGroupe(codes) {
    effacerMarques();
    if (fantome) { fantome.remove(); fantome = null; }
    groupe = [...new Set(codes)];
    marquerSelection();
    const visibles = groupe.map((c) => parCode.get(c)).filter(Boolean);
    if (visibles.length && !clicCarte) cadrer(L.featureGroup(visibles).getBounds());
    clicCarte = false;
    resumerGroupe(groupe);
  }

  function resumerGroupe(codes) {
    APP.collab?.fermer();
    jetonFiche++;
    $('fiche').hidden = false;
    const visibles = codes.filter((c) => parCode.has(c));
    $('fiche-titre').textContent = APP.pl(codes.length, 'lot sélectionné', 'lots sélectionnés');
    $('fiche-sous-titre').textContent = visibles.length === codes.length
      ? 'Tous sur le plan' : `${visibles.length} sur ${codes.length} affichés sur le plan`;
    const ligne = (c) => {
      const f = parCode.get(c);
      const p = f ? f.feature.properties : null;
      const detail = p ? [p.nom_phase, p.type_villa].filter(Boolean).join(' · ') : 'absent du plan ou masqué par les filtres';
      return `<li><a href="${esc(APP.lien('carte', c))}">Lot ${esc(p ? p.num_lot_plan || c : c)}</a> <span class="aide">${esc(detail)}</span></li>`;
    };
    $('fiche-corps').innerHTML = `<section><h3>Lots</h3><ul class="fiche-lots">${codes.map(ligne).join('')}</ul></section>`;
  }

  function rechercher(e) {
    e.preventDefault();
    const v = $('champ-lot').value.trim().toLowerCase();
    $('msg-recherche').textContent = '';
    if (!v) return;
    const f = APP.features.find((x) => String(x.properties.code_lot).toLowerCase() === v || String(x.properties.num_lot_plan || '').toLowerCase() === v);
    // Lot absent des résultats filtrés : la fiche le cherchera quand même dans la base
    location.hash = APP.lien('carte', f ? f.properties.code_lot : $('champ-lot').value.trim());
    if (!matchMedia('(min-width: 768px)').matches) ouvrirOutils(false);
  }

  // ---------- fiche lot ----------
  const dl = (lignes) => `<dl class="fiche-dl">${lignes.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const txt = (v) => (v == null || v === '' ? null : esc(v));
  const m2 = (v) => (v == null ? null : esc(num(v)) + ' m²');
  const fcfa = (v) => (v == null ? null : esc(SIG.fmtFCFA(v)));
  const libEtat = (k) => (k ? (cfg().etats_travaux[k] || {}).libelle || k : null);
  const libStatut = (k) => (k ? (cfg().statuts_commerciaux[k] || {}).libelle || k : null);

  function fermerFiche(majHash = true) {
    if (edition) annulerGeometrie();
    APP.collab?.fermer();
    effacerMarques();
    if (fantome) { fantome.remove(); fantome = null; }
    jetonFiche++;
    $('fiche').hidden = true;
    if (majHash) history.replaceState(null, '', APP.lien('carte'));
  }

  async function ouvrirFiche(code, visible, annonce) {
    const n = ++jetonFiche;
    $('fiche').hidden = false;
    $('fiche-titre').textContent = 'Lot ' + code;
    $('fiche-sous-titre').textContent = '';
    $('fiche-corps').innerHTML = '<p class="vide">Chargement de la fiche…</p>';
    let d;
    try {
      d = await SIG.api(`/api/lots/${encodeURIComponent(code)}/`);
    } catch (e) {
      if (n !== jetonFiche) return;
      $('fiche-corps').innerHTML = e.status === 404
        ? '<p class="note">Ce lot n’existe pas sur le plan. Il peut être cité par un dossier ou un suivi de travaux sans parcelle correspondante (voir le contrôle qualité).</p>'
        : `<p class="note erreur">Fiche indisponible : ${esc(e.message)}</p>`;
      return;
    }
    if (n !== jetonFiche) return;
    const p = d.lot.properties;
    if (!visible && d.lot.geometry) {
      // Lot masqué par les filtres : contour temporaire pour le situer
      fantome = L.geoJSON(d.lot, { interactive: false, style: { color: ACCENT(), weight: 3, dashArray: '5 4', fillOpacity: 0 } }).addTo(carte);
      cadrer(fantome.getBounds());
    }
    $('fiche-titre').textContent = 'Lot ' + (p.num_lot_plan || p.code_lot);
    $('fiche-sous-titre').textContent = [p.nom_phase || 'Hors phase', p.type_villa].filter(Boolean).join(' · ');

    let h = visible ? '' : '<p class="note">Ce lot ne fait pas partie des lots affichés avec les filtres actuels.</p>';
    const lotNom = p.num_lot_plan || p.code_lot;
    if (annonce) h += `<p class="msg succes" role="status">${esc(annonce)}</p>`;
    h += `<section${APP.ancre('champ', 'parcelle', `Lot ${lotNom} — Parcelle`)}><h3>Parcelle</h3>${dl([
      [LIBELLES.code_lot, txt(p.code_lot)], [LIBELLES.typologie, txt(p.typologie)],
      [LIBELLES.surface_m2, m2(p.surface_m2)], [LIBELLES.surface_plan, m2(p.surface_plan)],
      [LIBELLES.perimetre_contractuel, txt(p.perimetre_contractuel)],
    ])}</section>`;

    if (p.kfe_lot_contrat || p.kfe_avancement != null) {
      const solde = p.compte_solde || (p.reliquat != null && Number(p.reliquat) <= 0);
      const av = Number(p.kfe_avancement || (p.taux_execution ? p.taux_execution * 100 : 0));
      let alerteKfe = '';
      if (solde && av >= 90) {
        alerteKfe = '<div class="kfe-alerte-fiche succes"><strong>Prêt pour livraison :</strong> Villa achevée et compte soldé à 100%. Remise des clés autorisée.</div>';
      } else if (av >= 75 && p.reliquat && Number(p.reliquat) > 0) {
        alerteKfe = `<div class="kfe-alerte-fiche danger"><strong>Alerte recouvrement :</strong> Villa avancée (${pct(av / 100)}) mais reliquat impayé de ${fcfa(p.reliquat)}. Relance commerciale urgente avant livraison.</div>`;
      } else if (solde && av < 70) {
        alerteKfe = `<div class="kfe-alerte-fiche alerte"><strong>Priorité travaux :</strong> Acquéreur soldé à 100% mais chantier à ${pct(av / 100)}. Priorité d'intervention KFE.</div>`;
      }

      const barCorps = (nom, val) => `
        <div class="kfe-mini-ligne">
          <span class="kfe-mini-nom">${nom}</span>
          <div class="kfe-mini-jauge"><span style="width:${Math.min(100, Math.max(0, val || 0))}%;"></span></div>
          <span class="kfe-mini-val">${num(val || 0)} %</span>
        </div>`;

      h += `<section class="kfe-fiche-bloc"${APP.ancre('champ', 'kfe', `Lot ${lotNom} — Finitions KFE`)}>
        <div class="kfe-fiche-entete">
          <h3>Finitions KFE 160</h3>
          <span class="badge-kfe">${esc(p.kfe_lot_contrat || 'KFE 160')}</span>
        </div>
        ${alerteKfe}
        <div class="kfe-global-jauge">
          <div class="kfe-global-titre">
            <strong>Avancement global</strong>
            <span class="kfe-pct-grand">${pct(av / 100)}</span>
          </div>
          <div class="jauge"><span style="width:${Math.min(100, av)}%"></span></div>
          <div class="kfe-budget-ligne">
            <span>Budget : ${fcfa(p.kfe_budget || p.devis_ttc)}</span>
            <span>Exécuté : ${fcfa(p.kfe_montant || p.cout_realisation_ttc)}</span>
          </div>
        </div>
        <div class="kfe-corps-liste">
          <span class="c-etiquette">Détail des 7 corps d'état</span>
          ${barCorps('1. Gros œuvre', p.kfe_gros_oeuvre)}
          ${barCorps('2. Étanchéité', p.kfe_etancheite)}
          ${barCorps('3. Carrelage', p.kfe_carrelage)}
          ${barCorps('4. Menuiserie', p.kfe_menuiserie)}
          ${barCorps('5. Plomberie', p.kfe_plomberie)}
          ${barCorps('6. Électricité', p.kfe_electricite)}
          ${barCorps('7. Peinture', p.kfe_peinture)}
        </div>
      </section>`;
    }

    const et = p.etat_travaux ? (cfg().etats_travaux[p.etat_travaux] || {}) : null;
    h += `<section${APP.ancre('champ', 'travaux', `Lot ${lotNom} — Travaux`)}><h3>Travaux</h3>${p.etat_travaux || p.taux_execution != null ? dl([
      ['État', et ? `<span class="pastille" style="background-color:${esc(APP.couleur(et.couleur))}"></span>${esc(libEtat(p.etat_travaux))}` : null],
      ['Taux d’exécution', p.taux_execution == null ? null : esc(pct(p.taux_execution))],
      ['Implantée par', txt(p.implantee_par)], ['Situation au', txt(p.date_situation && APP.dateLongue(p.date_situation))],
      ['Devis TTC', fcfa(p.devis_ttc)], ['Coût réalisé TTC', fcfa(p.cout_realisation_ttc)],
    ]) : '<p class="vide">Aucun suivi de travaux.</p>'}</section>`;
    const st = p.statut_commercial ? (cfg().statuts_commerciaux[p.statut_commercial] || {}) : null;
    h += `<section${APP.ancre('champ', 'commercial', `Lot ${lotNom} — Commercial`)}><h3>Commercial</h3>${dl([
      ['Statut', st ? `<span class="pastille" style="background-color:${esc(APP.couleur(st.couleur))}"></span>${esc(libStatut(p.statut_commercial))}` : esc('Non renseigné')],
      ['Dossiers actifs', p.nb_dossiers_actifs == null ? null : esc(num(p.nb_dossiers_actifs))],
      ['Prix de vente', fcfa(p.prix_vente)], ['Total versé', fcfa(p.total_verse)], ['Reliquat', fcfa(p.reliquat)],
      ['Réf. acquéreur', txt(p.acquereur_ref)], ['Acquéreur', txt(p.acquereur_nom)], // acquereur_nom : absent pour la direction (API)
    ])}</section>`;
    if (p.observations) h += `<section${APP.ancre('champ', 'observations', `Lot ${lotNom} — Observations`)}><h3>Observations</h3><p class="obs">${esc(p.observations)}</p></section>`;

    h += clientsHTML(d) + remboursementsLotHTML(d.remboursements) + documentsHTML(d.documents || [], d) + historiqueHTML(d);
    if (APP.tech) h += formulaireHTML(p, visible);
    $('fiche-corps').innerHTML = h;
    if ($('fiche-copier')) $('fiche-copier').dataset.lien = APP.lien('carte', p.code_lot);
    if (APP.tech) brancherEdition(p, visible);
    APP.collab?.ouvrir({
      type: 'lot', id: p.code_lot, libelle: 'Lot ' + (p.num_lot_plan || p.code_lot),
      conteneur: $('fiche-corps'), entete: $('fiche-titre').parentElement,
      recharger: () => ouvrirFiche(p.code_lot, parCode.has(p.code_lot))
    });
  }

  // ---------- client(s), dossiers scannés et historique du lot ----------
  const ORDRE_STATUT = { actif: 0, doublon: 1, desistement: 2 };
  function clientsHTML(d) {
    if (!d.dossiers.length) return '<section><h3>Client</h3><p class="vide">Aucun dossier commercial sur ce lot.</p></section>';
    const C = APP.clients;
    const dossiers = [...d.dossiers].sort((a, b) => (ORDRE_STATUT[a.statut_dossier] ?? 9) - (ORDRE_STATUT[b.statut_dossier] ?? 9));
    return `<section><h3>${dossiers.length > 1 ? 'Clients' : 'Client'}</h3>${dossiers.map((x) => {
      // identité lue dans les scans de ce client (première valeur trouvée par champ)
      const champs = {};
      d.documents.filter((doc) => doc.acquereur_ref === x.acquereur_ref).forEach((doc) => Object.entries(doc.champs || {})
        .forEach(([k, v]) => { if (!champs[k] && v && v.valeur != null) champs[k] = v.valeur; }));
      const identite = ['telephone', 'email', 'profession', 'adresse', 'piece_identite', 'date_naissance', 'nationalite']
        .filter((k) => champs[k]).map((k) => [C.CHAMPS[k], esc((C.FORMATS[k] || String)(String(champs[k])))]);
      const rembDossier = (d.remboursements || []).find((r) => r.acquereur_ref === x.acquereur_ref || r.code_lot === x.code_lot);
      return `<div class="fl-client${x.statut_dossier === 'actif' ? '' : ' inactif'}">
        <p class="fl-nom"><a href="#clients/ref=${esc(encodeURIComponent(x.acquereur_ref))}">${esc(x.acquereur_nom || x.acquereur_ref)}</a>
          <span class="cl-badge ${x.statut_dossier === 'actif' ? '' : 'doux'}">${esc(x.statut_dossier)}</span>
          ${rembDossier ? '<span class="cl-badge vigilance">remboursement</span>' : ''}</p>
        ${dl([
          ['Réf. client', txt(x.acquereur_ref)], ['Réservation', txt(x.date_reservation && APP.dateLongue(x.date_reservation))],
          ['Option de paiement', txt(x.option_paiement)], ['Prix de vente', fcfa(x.prix_vente)], ['Frais de dossier', fcfa(x.frais_dossier)],
          ['Total versé', fcfa(x.total_verse)], ['Reliquat', fcfa(x.reliquat)], ['État du compte', txt(x.etat_compte)],
          ['Désistement', txt(x.date_desistement && APP.dateLongue(x.date_desistement))], ['Remboursé', fcfa(x.montant_rembourse)],
          ['Anomalies', txt((x.anomalies || []).join(', '))], ...identite,
        ])}
        <div class="actions"><a class="bouton secondaire" href="#clients/ref=${esc(encodeURIComponent(x.acquereur_ref))}">Fiche client</a>
          <button type="button" class="bouton secondaire" data-releve="${esc(x.acquereur_ref)}">Relevé de compte</button></div></div>`;
    }).join('')}</section>`;
  }

  function remboursementsLotHTML(remboursements) {
    if (!remboursements || !remboursements.length) return '';
    return `<section><h3>Remboursements & Désistements</h3>${remboursements.map((r) => `
      <div class="fl-client inactif" style="border-left: 3px solid #86282B; margin-bottom: 12px;">
        <p class="fl-nom"><strong>${esc(r.nature || 'Désistement')}</strong> <span class="cl-badge vigilance">${esc((r.type_desistement === 'nouveau' || r.type_dossier === 'nouveau') ? 'échéancier' : 'ancien')}</span></p>
        ${dl([
          ['Montant engagé', fcfa(r.montant_a_rembourser)],
          ['Déjà remboursé', fcfa(r.montant_rembourse)],
          ['Solde restant', fcfa(r.solde_restant)],
          ['Mode de paiement', txt(r.mode_paiement)],
          ['Contact', txt(r.contact)],
          ['Observations', txt(r.suivi || r.observations)],
        ])}
      </div>`).join('')}</section>`;
  }

  function documentsHTML(docs, d) {
    if (!docs.length) return '';
    return `<section><h3>${docs.length > 1 ? 'Dossiers scannés' : 'Dossier scanné'}</h3>${docs.map((doc) => {
      const alertes = (doc.alertes || []).filter((a) => a !== 'OCR_INCOMPLET');
      const total = doc.versements.filter((v) => !APP.clients.estFrais(v)).reduce((s, v) => s + (v.montant || 0), 0);
      const titulaire = doc.acquereur_ref ? (d.dossiers.find((x) => x.acquereur_ref === doc.acquereur_ref) || {}).acquereur_nom : null;
      return `<div class="fl-doc"><p><strong>${doc.categorie === 'contentieux' ? 'Dossier contentieux' : 'Dossier client'}${titulaire ? ' — ' + esc(titulaire) : doc.acquereur_ref ? '' : ' non rattaché à un client'}</strong>
          <span class="aide">${num(doc.pages_lues || 0)} / ${num(doc.nb_pages || 0)} pages lues · ${APP.pl(doc.versements.length, 'bordereau lu', 'bordereaux lus')}${doc.versements.length ? ' · ' + esc(SIG.fmtFCFA(total)) + ' hors frais' : ''}</span></p>
        ${alertes.length ? `<p class="fl-alertes"><a href="#validation">${APP.pl(alertes.length, 'écart à vérifier', 'écarts à vérifier')}</a> : ${esc(alertes.map((a) => a.split(':')[0].toLowerCase().replace(/_/g, ' ')).join(', '))}</p>` : ''}
        <button type="button" class="bouton secondaire" data-doc="${doc.id}" data-page="1">Ouvrir le PDF</button></div>`;
    }).join('')}</section>`;
  }

  const CHAMPS_HISTO = { statut: 'Statut commercial', type_villa: 'Type de villa', typologie: 'Typologie', observations: 'Observations', id_phase: 'Phase', contour: 'Contour' };
  // Frise unique, du plus récent au plus ancien : dossiers, contrat, versements, situations de travaux, modifications
  function historiqueHTML(d) {
    // dossier scanné sans client retrouvé (ex. ancien acquéreur du lot) : signalé pour ne pas le confondre
    const ev = [], nom = (ref) => (ref ? (d.dossiers.find((x) => x.acquereur_ref === ref) || {}).acquereur_nom || ref : 'dossier non rattaché à un client');
    d.dossiers.forEach((x) => {
      if (x.date_reservation) ev.push({ date: x.date_reservation, type: 'commercial', texte: `Réservation — ${esc(x.acquereur_nom || x.acquereur_ref)} · ${esc(SIG.fmtFCFA(x.prix_vente))}` });
      if (x.date_desistement) ev.push({ date: x.date_desistement, type: 'alerte', texte: `Désistement — ${esc(x.acquereur_nom || x.acquereur_ref)}${x.montant_rembourse ? ' · remboursé ' + esc(SIG.fmtFCFA(x.montant_rembourse)) : ''}` });
    });
    d.documents.forEach((doc) => {
      const c = doc.champs && doc.champs.date_contrat;
      if (c) ev.push({ date: c.valeur, type: 'commercial', texte: `Contrat de réservation signé — ${esc(nom(doc.acquereur_ref))} <button type="button" class="lien" data-doc="${doc.id}" data-page="${c.page}">p. ${c.page}</button>` });
      doc.versements.filter((v) => v.date_versement).forEach((v) => ev.push({ date: v.date_versement, type: 'versement',
        texte: `Versement ${esc(SIG.fmtFCFA(v.montant))}${v.nature ? ' — ' + esc(v.nature) : ''}${doc.acquereur_ref ? '' : ' <span class="aide">(dossier non rattaché)</span>'} <button type="button" class="lien" data-doc="${doc.id}" data-page="${v.page}">p. ${v.page}</button>` }));
    });
    d.travaux.forEach((t) => ev.push({ date: t.date_situation, type: 'travaux',
      texte: 'Situation des travaux — ' + esc([libEtat(t.etat), t.taux_execution == null ? null : pct(t.taux_execution), t.implantee_par].filter(Boolean).join(' · ')) }));
    (d.historique || []).forEach((m) => ev.push({ date: m.le, heure: true, type: 'modification',
      texte: `${esc(CHAMPS_HISTO[m.champ] || m.champ)} modifié${m.champ === 'observations' ? 'es' : ''} : ${esc(m.avant ?? '—')} → ${esc(m.apres ?? '—')}${m.par ? ' <span class="aide">par ' + esc(m.par) + '</span>' : ''}` }));
    if (!ev.length) return '<section><h3>Historique</h3><p class="vide">Aucun événement daté.</p></section>';
    ev.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `<section><h3>Historique</h3><ol class="historique frise">${ev.map((e) => `<li class="hi-${e.type}">
      <span class="h-date">${esc(APP.dateLongue(e.date, e.heure))}</span>${e.texte}</li>`).join('')}</ol></section>`;
  }

  // ---------- édition (rôle technicien uniquement : rien n'est rendu pour la direction) ----------
  // La vue v_lots éclipse deux colonnes de `parcelles` dès qu'une source plus précise existe :
  //   type_villa : suivi de travaux, puis dossier commercial ; statut_commercial : dossiers actifs.
  // Autoriser la saisie de ces champs ferait croire à un enregistrement sans effet (la valeur
  // revient au rechargement) : ils passent en lecture seule, avec la raison affichée.
  function champsDerives(p) {
    const statut = (p.nb_dossiers_actifs || 0) > 0;
    return { statut, type_villa: statut || p.date_situation != null };
  }

  function formulaireHTML(p, visible) {
    const opt = (liste, courant) => '<option value="">Non renseigné</option>' + liste.map(([v, l]) => `<option value="${esc(v)}"${v === courant ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const derive = champsDerives(p);
    const champ = (libelle, cle, liste, courant, raison) => derive[cle]
      ? `<label>${esc(libelle)}<select disabled>${opt(liste, courant)}</select>
          <span class="aide">${esc(raison)}</span></label>`
      : `<label>${esc(libelle)}<select name="${cle}">${opt(liste, courant)}</select></label>`;
    return `<section class="edition"><h3>Modifier les attributs</h3>
      <form id="form-attributs" class="formulaire">
        ${champ('Type de villa', 'type_villa', cfg().types_villa.map((t) => [t, t]), p.type_villa,
          'Repris du suivi de travaux ou du dossier commercial : non modifiable ici.')}
        ${champ('Statut commercial', 'statut', Object.entries(cfg().statuts_commerciaux).map(([k, v]) => [k, v.libelle]), p.statut_commercial,
          'Déduit des dossiers commerciaux actifs (soldé = vendu, non soldé = réservé) : non modifiable ici.')}
        <label>Observations<textarea name="observations" rows="3">${esc(p.observations || '')}</textarea></label>
        <p id="msg-attributs" class="msg" role="status" hidden></p>
        <button type="submit" class="bouton">Enregistrer les attributs</button>
      </form></section>
      <section class="edition"><h3>Modifier la géométrie</h3>
        ${visible ? `<p class="aide">Déplacez les sommets du contour sur la carte, puis enregistrez.</p>
        <p id="surface-edition" class="aide" hidden></p>
        <p id="msg-geometrie" class="msg" role="status" hidden></p>
        <div class="actions">
          <button type="button" id="geom-debut" class="bouton secondaire">Déplacer les sommets</button>
          <button type="button" id="geom-enregistrer" class="bouton" hidden>Enregistrer le contour</button>
          <button type="button" id="geom-annuler" class="bouton secondaire" hidden>Annuler</button>
        </div>` : '<p class="aide">Retirez les filtres pour afficher ce lot et modifier son contour.</p>'}
      </section>`;
  }

  function message(id, texte, ok) {
    const m = $(id);
    m.hidden = !texte; m.textContent = texte || '';
    m.className = 'msg ' + (ok ? 'succes' : 'erreur');
  }

  function brancherEdition(p, visible) {
    $('form-attributs').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, b = f.querySelector('button');
      // n'envoie que les champs modifiés (les autres restent tels quels en base) ; les champs
      // dérivés sont désactivés dans le formulaire et donc ignorés ici
      const avant = { type_villa: p.type_villa || '', statut: p.statut_commercial || '', observations: p.observations || '' };
      const corps = {};
      ['type_villa', 'statut', 'observations'].forEach((k) => {
        const champ = f.elements[k];
        if (!champ || champ.disabled) return;
        const v = champ.value;
        if (v !== avant[k]) corps[k] = v.trim() === '' ? null : v;
      });
      if (!Object.keys(corps).length) { message('msg-attributs', 'Aucune modification à enregistrer.', true); return; }
      const lu = { type_villa: p.type_villa ?? null, statut: p.statut_commercial ?? null, observations: p.observations ?? null };
      const url = `/api/lots/${encodeURIComponent(p.code_lot)}/`;
      const envoyer = (c) => SIG.api(url, { method: 'PATCH', body: c });
      b.disabled = true;
      try {
        const enr = APP.ui && APP.ui.enregistrerAvecConflits;
        const r = enr ? await enr({ envoyer, corps, origine: Object.fromEntries(Object.keys(corps).map((k) => [k, lu[k]])) })
          : { statut: 'enregistre', reponse: await envoyer(corps) };
        if (r.statut === 'annule') { message('msg-attributs', 'Enregistrement annulé : vos saisies sont conservées.', false); b.disabled = false; return; }
        if (r.statut === 'sienne') { await rafraichirApresEdition(p.code_lot, 'Version de votre collègue conservée : rien n’a été enregistré.'); return; }
        document.dispatchEvent(new Event('collab:enregistre'));
        await rafraichirApresEdition(p.code_lot, 'Attributs enregistrés.');
      } catch (err) {
        message('msg-attributs', "L'enregistrement a échoué : " + err.message, false);
        b.disabled = false;
      }
    });
    if (!visible) return;
    $('geom-debut').addEventListener('click', () => debutGeometrie(p.code_lot));
    $('geom-annuler').addEventListener('click', annulerGeometrie);
    $('geom-enregistrer').addEventListener('click', enregistrerGeometrie);
  }

  // Recharge données + synthèse (les KPI ont pu changer) puis rouvre la fiche avec un message
  async function rafraichirApresEdition(code, texte) {
    recadrer = false;
    if (await APP.charger()) dessinerCouche();
    ouvrirFiche(code, parCode.has(code), texte);
  }

  let edition = null; // { layer, origine, sommets }
  function debutGeometrie(code) {
    const layer = parCode.get(code);
    if (!layer || layer.feature.geometry.type !== 'Polygon') { message('msg-geometrie', 'Seuls les polygones simples sont modifiables ici.', false); return; }
    const origine = layer.getLatLngs().map((r) => r.map((ll) => L.latLng(ll.lat, ll.lng)));
    const anneau = layer.getLatLngs()[0];
    edition = { layer, origine, sommets: [] };
    layer.setStyle({ color: '#B3261E', weight: 2.5, fillOpacity: 0.35 });
    anneau.forEach((ll, i) => {
      const m = L.marker(ll, { draggable: true, icon: L.divIcon({ className: 'sommet', iconSize: [14, 14] }), title: 'Sommet ' + (i + 1) }).addTo(carte);
      m.on('drag', () => { anneau[i] = m.getLatLng(); layer.setLatLngs([anneau, ...layer.getLatLngs().slice(1)]); majSurface(anneau); });
      edition.sommets.push(m);
    });
    majSurface(anneau);
    $('geom-debut').hidden = true; $('geom-enregistrer').hidden = false; $('geom-annuler').hidden = false;
    message('msg-geometrie', null);
  }

  // Aire sphérique approchée, suffisante pour contrôler l'édition d'un lot
  function majSurface(anneau) {
    const R = 6378137, rad = Math.PI / 180;
    let a = 0;
    anneau.forEach((p1, i) => {
      const p2 = anneau[(i + 1) % anneau.length];
      a += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
    });
    const s = $('surface-edition');
    s.hidden = false;
    s.textContent = 'Surface estimée : ' + num(Math.abs(a * R * R / 2)) + ' m²';
  }

  function finGeometrie() {
    edition.sommets.forEach((m) => m.remove());
    couche.resetStyle(edition.layer);
    edition = null;
    marquerSelection();
    if ($('geom-debut')) { $('geom-debut').hidden = false; $('geom-enregistrer').hidden = true; $('geom-annuler').hidden = true; $('surface-edition').hidden = true; }
  }
  function annulerGeometrie() {
    if (!edition) return;
    edition.layer.setLatLngs(edition.origine);
    finGeometrie();
  }
  async function enregistrerGeometrie() {
    const { layer } = edition, code = layer.feature.properties.code_lot;
    const geometry = layer.toGeoJSON(7).geometry;
    $('geom-enregistrer').disabled = true;
    try {
      await SIG.api(`/api/lots/${encodeURIComponent(code)}/geometry/`, { method: 'PUT', body: { geometry } });
      edition.sommets.forEach((m) => m.remove());
      edition = null;
      await rafraichirApresEdition(code, 'Contour enregistré.');
    } catch (err) {
      $('geom-enregistrer').disabled = false;
      message('msg-geometrie', 'Contour refusé : ' + ((err.data && err.data.geometry) || err.message), false);
    }
  }

  // ---------- exports (jamais de nom d'acquéreur ni de lien de document, quel que soit le rôle) ----------
  const EXCLUS = ['acquereur_nom', 'lien_doc'];
  function exporter(format) {
    const features = APP.features.map((f) => {
      const properties = { ...f.properties };
      EXCLUS.forEach((k) => delete properties[k]);
      return { type: 'Feature', id: f.id, geometry: f.geometry, properties };
    });
    if (!features.length) return;
    const jour = new Date().toISOString().slice(0, 10), base = `lots-${cfg().projet.code || 'projet'}-${jour}`;
    let contenu, type, nom;
    if (format === 'geojson') {
      contenu = JSON.stringify({ type: 'FeatureCollection', features });
      type = 'application/geo+json'; nom = base + '.geojson';
    } else {
      const cles = Object.keys(features[0].properties);
      const cell = (v) => (v == null ? '' : '"' + String(v).replace(/"/g, '""') + '"');
      contenu = '﻿' + [cles.join(';'), ...features.map((f) => cles.map((k) => cell(f.properties[k])).join(';'))].join('\r\n');
      type = 'text/csv;charset=utf-8'; nom = base + '.csv';
    }
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nom });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Changement de thème : parcelles, sélection, légende et couches de contexte recolorées
  document.addEventListener('sig:theme', () => {
    if (!carte) return;
    changerTheme();
    const styles = STYLES_EXTRAS();
    Object.entries(extras).forEach(([nom, couche]) => couche.setStyle(styles[nom]));
  });

  APP.tranchesKfe = TRANCHES_KFE; // palette d'avancement KFE, partagée avec le tableau de bord des chantiers
APP.vues.carte = { afficher, EXCLUS };
})();
