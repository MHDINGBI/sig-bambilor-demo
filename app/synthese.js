// Onglet Synthèse — tuiles KPI, points d'attention, graphiques, export PDF COPIL.
// Données : APP.kpi et APP.features (chargés par app.js selon les filtres communs).
(function () {
  const { $, esc, num, pct, pl, ratio, fmtCompact, esp, nf2 } = APP;

  // Palette lue dans les jetons du thème courant (clair / sombre) ; les couleurs d'état viennent de la config.
  const CLAIR = { encre: '#2B2523', gris: '#5C544F', trait: '#E0D6C8', papier: '#FFFFFF', accent: '#86282B', teinte: '#DDB9BA', reste: '#CDBFAE', sansSuivi: '#FFFFFF' };
  function palette() {
    const j = APP.jeton;
    return { encre: j('--encre'), gris: j('--gris'), trait: j('--trait'), papier: j('--papier'), accent: j('--accent'),
      teinte: APP.sombre() ? '#6E4A40' : '#DDB9BA', reste: j('--trait-fort'), sansSuivi: j('--vide-carte') };
  }
  let C = CLAIR;
  const CORPS = '"Montserrat", "Segoe UI", Arial, sans-serif';
  const MOTIFS = { NON_LIVREE: 'diag', A_FINIR: 'croix' }; // lisibilité en N&B du plan imprimé
  const ANIM = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 };

  // Seuils des points d'attention (règles explicites)
  const SEUIL_RECOUVREMENT_PHASE = 0.60;
  const SEUIL_RECOUVREMENT_GLOBAL = 0.80;
  const SEUIL_LIVRAISON_PHASE = 0.50;
  const SEUIL_EXECUTION_TYPE = 0.70;

  let vu = -1, pret = false;
  const graphiques = {};
  const cfg = () => APP.cfg;

  // ---------- recalcul client (mode dev uniquement) ----------
  // Reproduit les définitions du contrat à partir des propriétés des parcelles.
  function agreger(fs) {
    const a = { lots: fs.length, surface: 0, suivies: 0, livrees: 0, exec: 0, nExec: 0, devis: 0, realise: 0,
      ventes: 0, encaisse: 0, reliquat: 0, nPrix: 0, dossiers: 0, par_etat: {}, par_statut: {} };
    Object.keys(cfg().etats_travaux).forEach((k) => (a.par_etat[k] = 0));
    Object.keys(cfg().statuts_commerciaux).forEach((k) => (a.par_statut[k] = 0));
    for (const { properties: p } of fs) {
      a.surface += p.surface_m2 || 0;
      if (p.statut_commercial in a.par_statut) a.par_statut[p.statut_commercial]++;
      if (p.etat_travaux) {
        a.suivies++;
        if (p.etat_travaux in a.par_etat) a.par_etat[p.etat_travaux]++;
        if (p.etat_travaux === 'LIVREE' || p.etat_travaux === 'LIVREE_SOUS_RESERVE') a.livrees++;
      }
      if (p.taux_execution != null) { a.exec += p.taux_execution; a.nExec++; }
      a.devis += p.devis_ttc || 0;
      a.realise += p.cout_realisation_ttc || 0;
      if (p.prix_vente != null) a.nPrix++;
      a.ventes += p.prix_vente || 0;
      a.encaisse += p.total_verse || 0;
      a.reliquat += p.reliquat || 0;
      a.dossiers += p.nb_dossiers_actifs || 0;
    }
    return a;
  }
  function kpiDepuisParcelles(fs, kpiDev) {
    const t = agreger(fs);
    const commercialConnu = t.nPrix > 0; // sinon : non recalculable, on n'invente rien
    const v = (x) => (commercialConnu ? x : null);
    const groupe = (cle) => {
      const g = new Map();
      fs.forEach((f) => { const k = f.properties[cle]; if (k) (g.get(k) || g.set(k, []).get(k)).push(f); });
      return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, liste]) => {
        const s = agreger(liste);
        return { [cle]: k, nom_phase: liste[0].properties.nom_phase, lots: s.lots, villas_suivies: s.suivies, livrees: s.livrees,
          taux_execution_moyen: ratio(s.exec, s.nExec), ventes_ttc: v(s.ventes), encaisse_ttc: v(s.encaisse),
          taux_recouvrement: v(ratio(s.encaisse, s.ventes)) };
      });
    };
    return {
      lots: { total: t.lots, par_statut: t.par_statut, surface_ha: t.surface / 1e4 },
      travaux: { villas_suivies: t.suivies, date_situation: (kpiDev.travaux || {}).date_situation, par_etat: t.par_etat,
        taux_execution_moyen: ratio(t.exec, t.nExec), devis_ttc: t.devis, realise_ttc: t.realise, taux_livraison: ratio(t.livrees, t.suivies) },
      commercial: { dossiers_actifs: v(t.dossiers), ventes_ttc: v(t.ventes), encaisse_ttc: v(t.encaisse), reliquat_ttc: v(t.reliquat),
        taux_recouvrement: v(ratio(t.encaisse, t.ventes)), desistements: null, doublons: null },
      par_phase: groupe('code_phase'),
      par_type: groupe('type_villa'),
      calcule_le: kpiDev.calcule_le,
    };
  }

  // ---------- affichage ----------
  function afficher() {
    if (!pret) {
      pret = true;
      $('export-pdf').addEventListener('click', exporterPDF);
    }
    if (vu === APP.version || !APP.kpi) return;
    vu = APP.version;
    C = palette();
    $('s-portee').textContent = APP.libelleFiltres();
    $('tuiles').innerHTML = tuilesHTML();
    $('bandes').innerHTML = bandesHTML();
    $('attention').innerHTML = attentionHTML(true);
    dessinerPlan();
    dessinerGraphiques();
    planifierImpression();
  }

  // ---------- tuiles KPI ----------
  function tuilesHTML() {
    const kpi = APP.kpi, L = kpi.lots, T = kpi.travaux, M = kpi.commercial;
    const res = L.par_statut.reserve || 0, ven = L.par_statut.vendu || 0;
    const livrees = (T.par_etat.LIVREE || 0) + (T.par_etat.LIVREE_SOUS_RESERVE || 0);
    const nonCalc = 'Non recalculable avec ce filtre (démonstration)';
    const tuiles = [
      { label: 'Lots du lotissement', valeur: num(L.total), ctx: esp(nf2.format(L.surface_ha || 0)) + ' ha de parcelles' },
      { label: 'Lots commercialisés', valeur: pct(ratio(res + ven, L.total)), r: ratio(res + ven, L.total),
        ctx: pl(res, 'réservé', 'réservés') + ' · ' + pl(ven, 'vendu', 'vendus') },
      { label: 'Ventes TTC', valeur: fmtCompact(M.ventes_ttc),
        ctx: M.ventes_ttc == null ? nonCalc : pl(M.dossiers_actifs, 'dossier actif', 'dossiers actifs')
          + (M.double_attribution && M.double_attribution.ventes_ttc > 0
            ? ' · dont ' + fmtCompact(M.double_attribution.ventes_ttc) + ' sur ' + pl(M.double_attribution.lots, 'lot', 'lots') + ' en double attribution'
            : '') },
      { label: 'Ventes encaissées', valeur: pct(M.taux_recouvrement), r: M.taux_recouvrement,
        ctx: M.ventes_ttc == null ? nonCalc : fmtCompact(M.encaisse_ttc, false) + ' encaissés · reste ' + fmtCompact(M.reliquat_ttc) },
      { label: 'Villas livrées', valeur: pct(T.taux_livraison), r: T.taux_livraison,
        ctx: num(livrees) + ' sur ' + pl(T.villas_suivies, 'villa suivie', 'villas suivies') },
      { label: 'Exécution des travaux', valeur: pct(T.taux_execution_moyen), r: T.taux_execution_moyen,
        ctx: 'Réalisé ' + fmtCompact(T.realise_ttc, false) + ' sur ' + fmtCompact(T.devis_ttc) + ' de devis' },
    ];
    return tuiles.map((t) => `
      <article class="tuile">
        <h3>${esc(t.label)}</h3>
        <p class="valeur">${valeurHTML(t.valeur)}</p>
        ${t.r != null ? `<div class="jauge" aria-hidden="true"><span style="width:${Math.min(100, Math.max(0, t.r * 100)).toFixed(1)}%"></span></div>` : '<div class="jauge sans" aria-hidden="true"></div>'}
        <p class="contexte">${esc(t.ctx)}</p>
      </article>`).join('');
  }
  // Nombre insécable + unité plus petite, qui peut passer à la ligne
  const valeurHTML = (v) => {
    const m = /^(.*?)(?: (Mds FCFA|M FCFA|FCFA))?$/.exec(v);
    return `<span class="nb">${esc(m[1])}</span>` + (m[2] ? ` <span class="unite">${esc(m[2])}</span>` : '');
  };

  // ---------- bandeaux de phase (silhouette réelle des lots de chaque phase) ----------
  function silhouette(code) {
    const anneaux = APP.features.filter((f) => f.properties.code_phase === code && f.geometry && f.geometry.type === 'Polygon').map((f) => f.geometry.coordinates[0]);
    if (!anneaux.length) return '';
    const pts = anneaux.flat(), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), w = (x1 - x0) * k || 1e-9, h = (y1 - y0) || 1e-9;
    const e = Math.min(96 / w, 64 / h), ox = (100 - w * e) / 2, oy = (68 - h * e) / 2;
    const d = anneaux.map((r) => 'M' + r.map(([x, y]) => `${(ox + (x - x0) * k * e).toFixed(1)},${(oy + (y1 - y) * e).toFixed(1)}`).join('L') + 'Z').join('');
    return `<svg viewBox="0 0 100 68" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  function bandesHTML() {
    const kpi = APP.kpi, ordre = cfg().phases;
    const val = (x, suffixe) => (x == null ? '<span class="b-val muet">—</span>' : `<span class="b-val">${x}${suffixe ? ` <small>${suffixe}</small>` : ''}</span>`);
    const jauge = (r) => (r == null ? '' : `<div class="jauge" aria-hidden="true"><span style="width:${Math.min(100, Math.max(0, r * 100)).toFixed(1)}%"></span></div>`);
    const mds = (n) => (n == null ? null : esp(nf2.format(n / 1e9)));
    const lignes = ordre.map((ph, i) => ({ ph, i, p: kpi.par_phase.find((x) => x.code_phase === ph.code) }))
      .filter(({ p }) => p && (p.lots || p.villas_suivies || p.ventes_ttc));
    // R18 : dossiers actifs hors des phases du plan, sinon la somme des bandeaux ne retombe pas sur le total
    const sp = kpi.commercial.sans_phase;
    const horsPhase = sp && sp.dossiers > 0
      ? `<p class="note b-hors-phase">Hors phase : ${esc(pl(sp.dossiers, 'dossier actif', 'dossiers actifs'))} · ${esc(fmtCompact(sp.ventes_ttc))} de ventes, dont ${esc(fmtCompact(sp.encaisse_ttc))} encaissés, non répartis dans les phases ci-dessus.</p>`
      : '';
    if (!lignes.length) return '<p class="vide">Aucune phase pour ces filtres.</p>' + horsPhase;
    return lignes.map(({ ph, i, p }) => {
      const filtres = { ...APP.filtres, phase: [ph.code] };
      const href = APP.lien('synthese', null, filtres), hrefCarte = APP.lien('carte', null, filtres);
      const suivies = p.villas_suivies > 0;
      return `<article class="bande" style="--bande:var(--ph${i + 1}, var(--gris))">
        <div class="b-tete">
          <a class="b-id" href="${esc(href)}" title="Filtrer la synthèse sur cette phase"><strong>${esc(ph.nom)}</strong><span>${esc(pl(p.lots, 'lot', 'lots'))} · filtrer</span>${silhouette(ph.code)}</a>
          <a class="b-carte" href="${esc(hrefCarte)}">Voir sur la carte&nbsp;→</a>
        </div>
        <div class="b-cell"><span class="c-etiquette">Villas livrées</span>${suivies ? val(num(p.livrees), '/ ' + num(p.villas_suivies)) : '<span class="b-val muet">aucune villa suivie</span>'}</div>
        <div class="b-cell"><span class="c-etiquette">Exécution</span>${suivies ? val(pct(p.taux_execution_moyen)) + jauge(p.taux_execution_moyen) : val(null)}</div>
        <div class="b-cell"><span class="c-etiquette">Ventes TTC</span>${val(mds(p.ventes_ttc), 'Mds')}</div>
        <div class="b-cell"><span class="c-etiquette">Encaissé</span>${val(mds(p.encaisse_ttc), 'Mds')}</div>
        <div class="b-cell"><span class="c-etiquette">Recouvrement</span>${p.ventes_ttc ? val(pct(p.taux_recouvrement)) + jauge(p.taux_recouvrement) : val(null)}</div>
        <div class="b-cell"><span class="c-etiquette">Reste à encaisser</span>${val(p.ventes_ttc == null ? null : mds(p.ventes_ttc - p.encaisse_ttc), 'Mds')}</div>
      </article>`;
    }).join('') + horsPhase;
  }

  // ---------- plan de synthèse (image vectorielle, sans fond de carte) ----------
  function dessinerPlan() {
    const img = imageCarte(900, 560, false);
    $('plan-image').hidden = !img;
    if (img) { $('plan-image').src = img; $('plan-image').alt = `Plan de ${pl(APP.features.length, 'lot', 'lots')} coloré par état des travaux`; }
    $('plan-portee').textContent = pl(APP.features.length, 'lot affiché', 'lots affichés') + ' · cliquer pour ouvrir la carte';
    $('plan-lien').href = APP.lien('carte');
    $('plan-legende').innerHTML = legendeHTML(false);
  }

  // ---------- points d'attention ----------
  // `filtre` : filtres à superposer aux filtres courants, pour la synthèse elle-même ou pour la carte
  function constats() {
    const kpi = APP.kpi, L = kpi.lots, T = kpi.travaux, M = kpi.commercial, out = [];
    const alerte = (texte, filtre) => out.push({ niveau: 'alerte', texte, filtre });
    const vigil = (texte, filtre) => out.push({ niveau: 'vigilance', texte, filtre });
    const commercialises = (L.par_statut.reserve || 0) + (L.par_statut.vendu || 0);

    // R1 — ventes enregistrées mais aucun lot réservé/vendu : statuts à mettre à jour
    if (M.ventes_ttc > 0 && commercialises === 0)
      alerte(`Aucun lot n'est marqué réservé ou vendu alors que ${fmtCompact(M.ventes_ttc)} de ventes sont enregistrées : statuts à mettre à jour.`);
    // R2 — phase encaissée à moins de 60 %
    kpi.par_phase.filter((p) => p.code_phase && p.ventes_ttc > 0 && p.taux_recouvrement < SEUIL_RECOUVREMENT_PHASE)
      .forEach((p) => alerte(`${p.nom_phase || p.code_phase} : seulement ${pct(p.taux_recouvrement)} des ventes encaissées.`, { phase: [p.code_phase] }));
    // R3 — villas à finir
    if (T.par_etat.A_FINIR > 0) alerte(`${pl(T.par_etat.A_FINIR, 'villa', 'villas')} à finir.`, { etat_travaux: ['A_FINIR'] });
    // R4 — doublons de dossiers
    if (M.doublons > 0) alerte(`${pl(M.doublons, 'dossier en doublon', 'dossiers en doublon')} à régulariser.`);
    // R5 — reste à encaisser global
    if (M.ventes_ttc > 0 && M.taux_recouvrement < SEUIL_RECOUVREMENT_GLOBAL)
      vigil(`Reste à encaisser : ${fmtCompact(M.reliquat_ttc)}, soit ${pct(1 - M.taux_recouvrement)} des ventes.`);
    // R6 — phase livrée à moins de 50 %
    kpi.par_phase.filter((p) => p.code_phase && p.villas_suivies > 0 && ratio(p.livrees, p.villas_suivies) < SEUIL_LIVRAISON_PHASE)
      .forEach((p) => vigil(`${p.nom_phase || p.code_phase} : ${num(p.livrees)} villas livrées sur ${num(p.villas_suivies)} (${pct(ratio(p.livrees, p.villas_suivies))}).`,
        { phase: [p.code_phase], etat_travaux: ['NON_LIVREE', 'A_FINIR'] }));
    // R7 — type de villa en retard d'exécution
    kpi.par_type.filter((t) => t.type_villa && t.villas_suivies > 0 && t.taux_execution_moyen < SEUIL_EXECUTION_TYPE)
      .forEach((t) => vigil(`Villas ${t.type_villa} : exécution moyenne à ${pct(t.taux_execution_moyen)}.`, { type_villa: [t.type_villa] }));
    // R8 — désistements
    if (M.desistements > 0) vigil(`${pl(M.desistements, 'désistement enregistré', 'désistements enregistrés')}.`);

    return out.slice(0, 5); // alertes d'abord (ordre d'insertion), 5 au plus
  }
  function attentionHTML(liens) {
    const c = constats();
    if (!c.length) return '<li class="rien">Aucun point bloquant selon les règles suivies.</li>';
    return c.map((x) => {
      const niveau = `<span class="niveau">${x.niveau === 'alerte' ? 'À traiter' : 'À surveiller'}</span>`;
      if (!liens || !x.filtre) return `<li class="${x.niveau}">${niveau}${esc(x.texte)}</li>`;
      const filtres = { ...APP.filtres, ...x.filtre };
      return `<li class="${x.niveau}">${niveau}<a href="${esc(APP.lien('synthese', null, filtres))}">${esc(x.texte)} <span class="voir">Filtrer la synthèse&nbsp;→</span></a>`
        + `<a class="voir" href="${esc(APP.lien('carte', null, filtres))}">Voir sur la carte&nbsp;→</a></li>`;
    }).join('');
  }

  // ---------- plan imprimé (catégories travaux) ----------
  const cleLot = (p) => p.etat_travaux || null;
  // clair = true : couleurs d'origine (impression) ; sinon adaptées au thème courant
  const couleurLot = (p, clair) => { const k = cleLot(p), c = k && cfg().etats_travaux[k] && cfg().etats_travaux[k].couleur; return c ? (clair ? c : APP.couleur(c)) : (clair ? CLAIR.sansSuivi : C.sansSuivi); };
  function legendeHTML(clair = true) {
    const n = new Map();
    APP.features.forEach((f) => { const k = cleLot(f.properties); n.set(k, (n.get(k) || 0) + 1); });
    const cats = Object.entries(cfg().etats_travaux).map(([k, v]) => ({ k, libelle: v.libelle, couleur: clair ? v.couleur : APP.couleur(v.couleur) }));
    cats.push({ k: null, libelle: 'Sans suivi de travaux', couleur: clair ? CLAIR.sansSuivi : C.sansSuivi });
    return cats.filter((c) => n.get(c.k))
      .map((c) => `<li><span class="pastille ${MOTIFS[c.k] || ''}" style="background-color:${esc(c.couleur)}"></span>${esc(c.libelle)} <span class="compte">${num(n.get(c.k))}</span></li>`)
      .join('') || '<li>Aucun lot pour ce filtre.</li>';
  }

  // Plan vectoriel sans fond de carte, pour l'impression et le PDF (les tuiles OSM ne se capturent pas de façon fiable)
  function imageCarte(w, h, clair = true) {
    const features = APP.features;
    if (!features.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const anneaux = (g) => (g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);
    features.forEach((f) => f.geometry && anneaux(f.geometry).forEach((r) => r.forEach(([x, y]) => {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    })));
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180); // équirectangulaire corrigé, suffisant à l'échelle du lotissement
    const marge = 10, ech = Math.min((w - 2 * marge) / ((x1 - x0) * k || 1), (h - 2 * marge) / ((y1 - y0) || 1));
    const ox = (w - (x1 - x0) * k * ech) / 2, oy = (h - (y1 - y0) * ech) / 2;
    const cv = document.createElement('canvas'), dpr = 2;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const motifs = { diag: motif(false), croix: motif(true) };
    features.forEach((f) => {
      if (!f.geometry) return;
      ctx.beginPath();
      anneaux(f.geometry).forEach((r) => r.forEach(([x, y], i) => {
        const px = ox + (x - x0) * k * ech, py = oy + (y1 - y) * ech;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }));
      ctx.fillStyle = couleurLot(f.properties, clair); ctx.fill();
      const mo = MOTIFS[cleLot(f.properties)];
      if (mo) { ctx.fillStyle = motifs[mo]; ctx.fill(); }
      ctx.lineWidth = 0.4; ctx.strokeStyle = clair ? '#5C544F' : APP.jeton('--trait-fort'); ctx.stroke();
    });
    return cv.toDataURL('image/png');
  }
  function motif(croix) {
    const c = document.createElement('canvas'); c.width = c.height = 6;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, 6); x.lineTo(6, 0);
    if (croix) { x.moveTo(0, 0); x.lineTo(6, 6); }
    x.stroke();
    return c.getContext('2d').createPattern(c, 'repeat');
  }

  // ---------- graphiques ----------
  function observer(el, g) { new ResizeObserver(() => g && !g.isDisposed() && g.resize()).observe(el); }

  function barres(id, { labels, datasets, total, texte, droite, legende, aria, tip }) {
    if (graphiques[id]) { graphiques[id].dispose(); delete graphiques[id]; }
    const cv = $(id);
    cv.setAttribute('aria-label', aria);
    cv.parentElement.style.height = Math.max(150, 46 * labels.length + (legende ? 50 : 30)) + 'px';
    const empile = datasets.length > 1;
    const etroit = cv.parentElement.clientWidth < 520, fs = etroit ? 12 : 13;
    const coupe = (l) => { const i = l.indexOf(' ', l.length / 2 - 2); return etroit && l.length > 10 && i > 0 ? l.slice(0, i) + '\n' + l.slice(i + 1) : l; };

    const g = graphiques[id] = echarts.init(cv, null, { renderer: 'svg' });

    const series = datasets.map((d, i) => {
      const isLast = i === datasets.length - 1;
      return {
        name: d.label,
        type: 'bar',
        stack: empile ? 'total' : undefined,
        data: d.data.map((val, idx) => {
          const c = Array.isArray(d.backgroundColor) ? d.backgroundColor[idx] : d.backgroundColor;
          return {
            value: val,
            itemStyle: {
              color: c,
              borderRadius: isLast ? [0, 4, 4, 0] : 0,
              borderColor: C.papier,
              borderWidth: empile && !isLast ? [0, 2, 0, 0] : 0
            }
          };
        }),
        barMaxWidth: 24,
        label: {
          show: isLast,
          position: 'right',
          formatter: (params) => texte(params.dataIndex),
          color: C.encre,
          fontSize: fs,
          fontWeight: '600',
          fontFamily: CORPS
        }
      };
    });

    g.setOption({
      animation: !!ANIM,
      grid: { top: legende ? 40 : 10, right: etroit ? droite * 0.8 : droite, bottom: 20, left: 10, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: C.trait } },
        axisLabel: { color: C.gris, fontSize: 12, formatter: tip.axe }
      },
      yAxis: {
        type: 'category',
        data: labels.map(coupe),
        axisLine: { lineStyle: { color: C.trait } },
        axisLabel: { color: C.encre, fontSize: fs + 1, fontWeight: '600', fontFamily: CORPS },
        inverse: true
      },
      legend: {
        show: !!legende,
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: C.encre, fontSize: 13, fontFamily: CORPS }
      },
      tooltip: {
        trigger: 'item',
        formatter: (p) => p.marker + ' ' + tip.label({ raw: p.value, dataset: { label: p.seriesName } })
      },
      series: series
    });
    observer(cv, g);
  }

  function dessinerGraphiques() {
    const kpi = APP.kpi, et = cfg().etats_travaux, st = cfg().statuts_commerciaux, T = kpi.travaux, L = kpi.lots;
    const axeNum = (v) => num(v);

    // (a) Recouvrement par phase : encaissé + reste, barres empilées
    const phases = kpi.par_phase.filter((p) => p.ventes_ttc > 0);
    const videA = !phases.length;
    $('v-recouvrement').hidden = !videA;
    $('g-recouvrement').parentElement.hidden = videA;
    if (videA) {
      if (graphiques['g-recouvrement']) { graphiques['g-recouvrement'].destroy(); delete graphiques['g-recouvrement']; }
      $('v-recouvrement').textContent = kpi.commercial.ventes_ttc == null
        ? 'Montants non recalculables avec ce filtre sur les données de démonstration.'
        : 'Aucune vente rattachée à une phase pour ces filtres.';
    } else {
      barres('g-recouvrement', {
        labels: phases.map((p) => p.nom_phase || p.code_phase || 'Hors phase'),
        datasets: [
          { label: 'Encaissé', data: phases.map((p) => p.encaisse_ttc), backgroundColor: C.accent },
          { label: 'Reste à encaisser', data: phases.map((p) => Math.max(0, p.ventes_ttc - p.encaisse_ttc)), backgroundColor: C.teinte },
        ],
        total: (i) => phases[i].ventes_ttc,
        texte: (i) => pct(phases[i].taux_recouvrement) + ' encaissé',
        droite: 120, legende: true,
        aria: 'Encaissement par phase : ' + phases.map((p) => `${p.nom_phase || p.code_phase || 'Hors phase'} ${pct(p.taux_recouvrement)} de ${fmtCompact(p.ventes_ttc)}`).join(' ; '),
        tip: { axe: (v) => fmtCompact(v, false), label: (c) => `${c.dataset.label} : ${SIG.fmtFCFA(c.raw)}` },
      });
    }

    // (b) État des travaux : une barre par état, couleurs de la config
    const etats = Object.keys(et);
    const nEtat = etats.map((k) => T.par_etat[k] || 0);
    barres('g-travaux', {
      labels: etats.map((k) => et[k].libelle),
      datasets: [{ label: 'Villas', data: nEtat, backgroundColor: etats.map((k) => APP.couleur(et[k].couleur)) }],
      total: (i) => nEtat[i],
      texte: (i) => `${num(nEtat[i])} · ${pct(ratio(nEtat[i], T.villas_suivies))}`,
      droite: 110,
      aria: `État des travaux sur ${num(T.villas_suivies)} villas suivies : ` + etats.map((k, i) => `${et[k].libelle} ${num(nEtat[i])}`).join(', '),
      tip: { axe: axeNum, label: (c) => `${num(c.raw)} villas` },
    });

    // (c) Avancement par type : livrées + non livrées = suivies ; taux d'exécution en étiquette
    const types = kpi.par_type.filter((t) => t.villas_suivies > 0);
    barres('g-types', {
      labels: types.map((t) => t.type_villa || 'Non renseigné'),
      datasets: [
        { label: 'Livrées', data: types.map((t) => t.livrees), backgroundColor: et.LIVREE ? APP.couleur(et.LIVREE.couleur) : C.encre },
        { label: 'Pas encore livrées', data: types.map((t) => t.villas_suivies - t.livrees), backgroundColor: C.reste },
      ],
      total: (i) => types[i].villas_suivies,
      texte: (i) => `${num(types[i].livrees)}/${num(types[i].villas_suivies)} · exéc. ${pct(types[i].taux_execution_moyen)}`,
      droite: 175, legende: true,
      aria: 'Avancement par type : ' + types.map((t) => `${t.type_villa} ${num(t.livrees)} livrées sur ${num(t.villas_suivies)}, exécution ${pct(t.taux_execution_moyen)}`).join(' ; '),
      tip: { axe: axeNum, label: (c) => `${c.dataset.label} : ${num(c.raw)}` },
    });

    // (d) Statuts commerciaux
    const statuts = Object.keys(st);
    const nSt = statuts.map((k) => L.par_statut[k] || 0);
    barres('g-statuts', {
      labels: statuts.map((k) => st[k].libelle),
      datasets: [{ label: 'Lots', data: nSt, backgroundColor: statuts.map((k) => APP.couleur(st[k].couleur)) }],
      total: (i) => nSt[i],
      texte: (i) => `${num(nSt[i])} · ${pct(ratio(nSt[i], L.total))}`,
      droite: 120,
      aria: `Statuts commerciaux sur ${num(L.total)} lots : ` + statuts.map((k, i) => `${st[k].libelle} ${num(nSt[i])}`).join(', '),
      tip: { axe: axeNum, label: (c) => `${num(c.raw)} lots` },
    });
  }

  // ---------- impression / export PDF ----------
  let minuteur;
  // Attend la fin des animations Chart.js avant de figer les images
  function planifierImpression() { clearTimeout(minuteur); minuteur = setTimeout(construireImpression, ANIM ? 450 : 50); }

  function construireImpression() {
    const plan = imageCarte(560, 380);
    const fig = (id, titre) => {
      const g = graphiques[id];
      const corps = g ? `<img src="${g.getDataURL({ type: 'png', pixelRatio: 1, backgroundColor: '#fff' })}" alt="${esc($(id).getAttribute('aria-label'))}">`
        : `<p class="vide">${esc($('v-recouvrement').textContent)}</p>`;
      return `<figure class="bloc"><h2>${esc(titre)}</h2>${corps}</figure>`;
    };
    const entete = (suite) => `<header class="r-tete"><svg class="logo" viewBox="2 2 243 103" aria-hidden="true"><use href="#logo-srt"/></svg><div>
        <h1>${esc(cfg().projet.nom)} <span>Comité de pilotage${suite ? ' — suite' : ''}</span></h1>
        <p>Chiffres calculés le ${esc($('date-calcul').textContent)} · Travaux au ${esc($('date-travaux').textContent)} · Filtres : ${esc(APP.libelleFiltres())}${SIG.DEV ? ' · Données de démonstration' : ''}</p>
      </div></header>`;
    $('impression').innerHTML = `<div class="rapport">
      <section class="page">
        ${entete(false)}
        <div class="tuiles">${tuilesHTML()}</div>
        <div class="r-rangee">
          <div class="bloc attention"><h2>Points d'attention</h2><ul>${attentionHTML(false)}</ul></div>
          ${plan ? `<figure class="bloc r-plan"><h2>Plan — avancement des travaux</h2>
            <img src="${plan}" alt="Plan des lots"><ul class="legende">${legendeHTML()}</ul></figure>` : ''}
        </div>
      </section>
      <section class="page page2">
        ${entete(true)}
        <div class="r-graphs">
          ${fig('g-recouvrement', 'Argent encaissé par phase')}
          ${fig('g-travaux', 'État des travaux')}
          ${fig('g-types', 'Avancement par type de villa')}
          ${fig('g-statuts', 'Situation commerciale des lots')}
        </div>
      </section>
    </div>`;
  }

  async function exporterPDF() {
    const b = $('export-pdf');
    if (!window.html2pdf) {
      APP.erreur("Le module d'export PDF n'a pas pu être chargé. Utilisez Ctrl+P puis « Enregistrer au format PDF ».");
      return;
    }
    b.disabled = true; b.textContent = 'Export en cours…';
    try {
      clearTimeout(minuteur);
      construireImpression();
      const jour = new Date().toISOString().slice(0, 10);
      await html2pdf().set({
        margin: [8, 8, 8, 8],
        filename: `COPIL-${cfg().projet.code || 'projet'}-${jour}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css'], before: '.page2' },
      }).from($('impression').firstElementChild).save();
    } catch (e) {
      APP.erreur("L'export PDF a échoué : " + e.message);
    } finally {
      b.disabled = false; b.textContent = 'Exporter en PDF';
    }
  }

  // Changement de thème : redessin complet (graphiques, plan, bandeaux) si la synthèse est affichée
  document.addEventListener('sig:theme', () => { vu = -1; if (pret && !$('vue-synthese').hidden) afficher(); });

  APP.vues.synthese = { afficher, kpiDepuisParcelles };
})();
