// Interface unique — init, rôle, navigation par hash, filtres communs, chargement des données.
// Contrat : docs/CONTEXTE-WORKERS.md. Les vues (synthese.js, carte.js, qc.js) s'enregistrent dans APP.vues.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = SIG.esc;
  const CLES = ['phase', 'type_villa', 'etat_travaux', 'statut'];
  const NOMS = { phase: ['Phase', 'Toutes'], type_villa: ['Type de villa', 'Tous'], etat_travaux: ['État des travaux', 'Tous'], statut: ['Statut commercial', 'Tous'] };

  // ---------- formateurs partagés ----------
  const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const esp = (s) => s.replace(/[  ]/g, ' ');
  // Montant compact : « 17,03 Mds FCFA »
  function fmtCompact(n, unite = true) {
    if (n == null) return '—';
    const u = unite ? ' FCFA' : '';
    if (Math.abs(n) >= 1e9) return esp(nf2.format(n / 1e9)) + ' Mds' + u;
    if (Math.abs(n) >= 1e6) return esp(nf1.format(n / 1e6)) + ' M' + u;
    return unite ? SIG.fmtFCFA(n) : SIG.fmtNum(n);
  }
  // Fuseau d'affichage des horodatages : déclaré dans config.yml (projet.fuseau) pour rester réplicable
  const fuseau = () => (APP && APP.cfg && APP.cfg.projet && APP.cfg.projet.fuseau) || 'UTC';
  const dateLongue = (iso, heure) => {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
    return d.toLocaleString('fr-FR', heure
      ? { dateStyle: 'long', timeStyle: 'short', timeZone: fuseau() }
      : { dateStyle: 'long', timeZone: 'UTC' });
  };

  // ---------- thème clair / sombre / auto (système) ----------
  const racine = document.documentElement;
  const lireMode = () => { try { return localStorage.getItem('sig.theme') || 'auto'; } catch (e) { return 'auto'; } };
  function appliquerTheme(mode) {
    if (mode === 'auto') delete racine.dataset.theme; else racine.dataset.theme = mode;
    try { if (mode === 'auto') localStorage.removeItem('sig.theme'); else localStorage.setItem('sig.theme', mode); } catch (e) { /* stockage indisponible : thème non mémorisé */ }
    document.querySelectorAll('.theme button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    document.dispatchEvent(new CustomEvent('sig:theme')); // les vues redessinent carte et graphiques
  }
  const jetonCss = (nom) => getComputedStyle(racine).getPropertyValue(nom).trim();
  // Taille de texte des grilles AG Grid : 14 px à la taille de base normale (16 px), réduite avec elle sur
  // les petits écrans (voir style.css). AG Grid ne suit pas le rem : on lui passe la valeur calculée.
  const taillePoliceGrille = () => Math.round(parseFloat(getComputedStyle(racine).fontSize) * 0.875 * 10) / 10;
  const sombre = () => jetonCss('--mode') === 'dark';
  // Couleurs de config.yml : éclaircies de 35 % en thème sombre pour rester lisibles sur fond foncé
  function couleur(hex) {
    if (!sombre() || !/^#[0-9a-f]{6}$/i.test(hex || '')) return hex;
    const n = parseInt(hex.slice(1), 16), m = (c) => Math.round(c + (255 - c) * 0.35);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((c) => m(c).toString(16).padStart(2, '0')).join('');
  }

  // ---------- noms de personnes ----------
  // Affichage commun à tous les tableaux : prénoms avec majuscule initiale, nom de famille en capitales
  // (« MAMADOU LAMINE TAMBA » → « Mamadou Lamine TAMBA »). Les noms saisis ne séparent pas toujours
  // prénoms et nom : sans nom connu, on prend les mots finaux en capitales d'un nom en casse mixte
  // (« Stephane BLE KOFFI »), sinon le dernier mot. Plusieurs titulaires (« A / B », « A & B », « A et B »)
  // sont traités un par un.
  const sansAccent = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const motCapitale = (m) => m.length > 1 && m === m.toLocaleUpperCase('fr') && m !== m.toLocaleLowerCase('fr');
  const casseInitiale = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr')
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('fr'))
    .replace(/ Et /g, ' et ');
  const capitales = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('fr');
  // {prenom, nom, nomDabord} bruts d'un seul titulaire ; seul : un mot unique d'un nom à plusieurs
  // titulaires est un prénom (« Diaraf et Annika SECK »).
  function decouper(texte, nomConnu, seul = true) {
    const mots = String(texte || '').trim().split(/\s+/).filter(Boolean);
    if (mots.length < 2) return seul ? { prenom: '', nom: mots.join('') } : { prenom: mots.join(''), nom: '' };
    const n = String(nomConnu || '').trim().split(/\s+/).filter(Boolean);
    if (n.length && n.length < mots.length) {
      const cle = sansAccent(n.join(' '));
      if (sansAccent(mots.slice(-n.length).join(' ')) === cle) {
        return { prenom: mots.slice(0, -n.length).join(' '), nom: mots.slice(-n.length).join(' ') };
      }
      if (sansAccent(mots.slice(0, n.length).join(' ')) === cle) {
        return { prenom: mots.slice(n.length).join(' '), nom: mots.slice(0, n.length).join(' '), nomDabord: true };
      }
    }
    let i = mots.length;
    if (mots.some((m) => !motCapitale(m))) while (i > 1 && motCapitale(mots[i - 1])) i--;
    if (i === mots.length) i--;
    return { prenom: mots.slice(0, i).join(' '), nom: mots.slice(i).join(' ') };
  }
  const SEPARATEURS = /(\s*\/\s*|\s*&\s*|\s+et\s+|\s+sc\s+)/i;   // sc : « sous couvert »
  // Nom de famille saisi à part : ignoré quand la fiche y a recopié tous les titulaires.
  const nomValide = (nom) => { const n = String(nom || '').trim(); return n && !SEPARATEURS.test(n) ? n : ''; };
  // Raison sociale (« CDC », « CHSBALS 160 TERRAINS ») : un seul mot ou des chiffres. Laissée telle que
  // saisie, entièrement dans la colonne Prénoms, sans nom de famille.
  const estEntite = (t) => { const x = String(t || '').trim(); return !!x && (!/\s/.test(x) || /\d/.test(x)); };
  // Titulaires mis en forme, un par entrée : [{prenom, nom, nomDabord}] ; nomConnu : nom de famille du
  // premier titulaire.
  function titulaires(texte, nomConnu) {
    const t = String(texte || '').trim();
    if (!t) return [];
    if (estEntite(t)) return [{ prenom: t, nom: '' }];
    const segs = t.split(SEPARATEURS).filter((x, i) => i % 2 === 0 && x.trim());
    return segs.map((x, i) => {
      if (/\d/.test(x)) return { prenom: x.trim(), nom: '' };
      const d = decouper(x, i === 0 ? nomValide(nomConnu) : null, segs.length === 1);
      return { prenom: casseInitiale(d.prenom), nom: capitales(d.nom), nomDabord: d.nomDabord };
    });
  }
  const unTitulaire = (x) => (x.nomDabord ? [x.nom, x.prenom] : [x.prenom, x.nom]).filter(Boolean).join(' ');
  // Premier titulaire, mis en forme : {prenom, nom}. prenom/nom : champs déjà séparés en base, s'il y en a.
  function identite(texte, prenom, nom, nomConnu) {
    if (String(nom || '').trim()) {
      return estEntite(nom) && !String(prenom || '').trim() ? { prenom: nom.trim(), nom: '' }
        : { prenom: casseInitiale(prenom), nom: capitales(nom) };
    }
    const tit = titulaires(texte, nomConnu);
    const x = tit[0] || { prenom: '', nom: '' };
    // « Diaraf et Annika SECK » : le premier titulaire porte le nom du dernier.
    return { prenom: x.prenom, nom: x.nom || (tit.length > 1 ? tit[tit.length - 1].nom : '') };
  }
  // Nom complet mis en forme, tous titulaires compris (séparateurs d'origine conservés).
  function nomPropre(texte, nomConnu) {
    const t = String(texte || '').trim();
    if (estEntite(t)) return t;
    const tit = titulaires(t, nomConnu);
    const seps = t.split(SEPARATEURS).filter((x, i) => i % 2 === 1)
      .map((x) => (/^\s*et\s*$/i.test(x) ? ' et ' : /^\s*sc\s*$/i.test(x) ? ' SC ' : ` ${x.trim()} `));
    return tit.map((x, i) => unTitulaire(x) + (seps[i] || '')).join('');
  }
  // Nom de famille du premier titulaire, en capitales : clé du tri « par nom » (vide pour une raison sociale).
  const nomFamille = (texte, nomConnu) => identite(texte, null, null, nomConnu).nom;
  const comparerNoms = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { sensitivity: 'base' });

  // ---------- Travail collaboratif : Copie de lien direct & Journal d'équipe ----------
  async function copierLien(hashOuUrl, boutonEl) {
    let url = hashOuUrl || location.hash;
    if (url && url.startsWith('#')) {
      url = window.location.origin + window.location.pathname + window.location.search + url;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const zone = document.createElement('textarea');
        zone.value = url;
        zone.style.position = 'fixed';
        zone.style.opacity = '0';
        document.body.appendChild(zone);
        zone.select();
        document.execCommand('copy');
        document.body.removeChild(zone);
      }
      if (boutonEl) {
        const txt = boutonEl.innerHTML;
        boutonEl.dataset.original = txt;
        boutonEl.classList.add('copie-succes');
        boutonEl.innerHTML = '✓ Lien copié !';
        setTimeout(() => {
          boutonEl.innerHTML = boutonEl.dataset.original || txt;
          boutonEl.classList.remove('copie-succes');
        }, 2200);
      }
      return true;
    } catch (e) {
      console.error('Erreur copie presse-papiers :', e);
      return false;
    }
  }

  function journalHTML(items) {
    if (!items || !items.length) {
      return '<p class="vide">Aucune activité récente enregistrée pour cet élément.</p>';
    }
    return `
      <ol class="journal-timeline">
        ${items.map((it) => `
          <li class="journal-entree type-${esc(it.type || 'modification')}">
            <div class="journal-entree-tete">
              <span class="journal-entree-titre">${esc(it.titre)}</span>
              <span class="journal-entree-auteur">${esc(it.par || 'Système')}</span>
              <time class="journal-entree-date">${esc(dateLongue(it.le, true))}</time>
            </div>
            ${(it.details && it.details.length) ? `
              <div class="journal-entree-details">${it.details.map((d) => `<div>${esc(d)}</div>`).join('')}</div>
            ` : ''}
          </li>
        `).join('')}
      </ol>
    `;
  }

  // Commentaires ancrés (collab v2, spec § 6) : attributs d'un élément commentable, à insérer dans une balise ouvrante :
  // `<tr${APP.ancre('versement', v.id, 'Versement …')}>`. Clé stable (identifiant, code), jamais une position dans une
  // liste ; ramenée au format validé par le serveur ^[a-z_]+:[A-Za-z0-9_.-]{1,60}$. Clé vide → aucun attribut.
  function ancre(type, cle, libelle) {
    const k = String(cle ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 60);
    if (!/^[a-z_]+$/.test(type) || !k || k === '_') return '';
    return ` data-ancre="${esc(type + ':' + k)}" data-ancre-libelle="${esc(String(libelle || `${type} ${cle}`).slice(0, 200))}"`;
  }

  const APP = window.APP = {
    $, esc, CLES, ancre,
    // Filtre de protocole (audit R03, D-04) : une URL destinée à href/src ne part qu'avec un
    // protocole connu (#, /, https://, mailto:, tel:), sinon '#' neutre. Pour toute donnée d'API.
    url: (u) => { const s = String(u ?? ''); return /^(#|\/|https:\/\/|mailto:|tel:)/.test(s) ? s : '#'; },
    cfg: null, me: null, tech: false, roles: [],
    // disponible dès le chargement des vues (renseigné par init) : APP.aRole('commercial')
    aRole: (...r) => r.some((x) => APP.roles.includes(x)),
    kpi: null, features: [], version: 0, // version : incrémentée à chaque rechargement des données
    filtres: vides(),
    vues: {},
    num: SIG.fmtNum, pct: SIG.fmtPct, fmtCompact, dateLongue, esp, nf2,
    pl: (n, s, p) => SIG.fmtNum(n) + ' ' + (n > 1 ? p : s),
    ratio: (a, b) => (b ? a / b : 0),
    lien, libelleFiltres, charger, erreur, jeton: jetonCss, sombre, couleur, taillePoliceGrille,
    copierLien, journalHTML,
    noms: { identite, nomPropre, nomFamille, titulaires, unTitulaire, comparer: comparerNoms },
  };
  function vides() { return { phase: [], type_villa: [], etat_travaux: [], statut: [] }; }

  // ---------- filtres ----------
  function options(cle) {
    const c = APP.cfg;
    if (cle === 'phase') return c.phases.map((p) => ({ v: p.code, l: p.nom }));
    if (cle === 'type_villa') return c.types_villa.map((t) => ({ v: t, l: t }));
    const src = cle === 'etat_travaux' ? c.etats_travaux : c.statuts_commerciaux;
    return Object.entries(src).map(([k, x]) => ({ v: k, l: x.libelle, couleur: x.couleur }));
  }
  const libelle = (cle, v) => (options(cle).find((o) => o.v === v) || { l: v }).l;

  function construireFiltres() {
    $('filtres').insertAdjacentHTML('afterbegin', CLES.map((cle) => `
      <details class="filtre" data-cle="${cle}">
        <summary><span class="c-etiquette">${esc(NOMS[cle][0])}</span><span class="f-val" id="v-${cle}">${esc(NOMS[cle][1])}</span></summary>
        <fieldset class="menu">
          <legend class="visuellement-cache">${esc(NOMS[cle][0])}</legend>
          ${options(cle).map((o) => `<label><input type="checkbox" name="${cle}" value="${esc(o.v)}">
            ${o.couleur ? `<span class="pastille" style="background-color:${esc(o.couleur)}"></span>` : ''}${esc(o.l)}</label>`).join('')}
        </fieldset>
      </details>`).join(''));
    const menus = [...document.querySelectorAll('.filtre')];
    // un seul menu ouvert à la fois ; fermeture au clic extérieur et sur Échap
    menus.forEach((d) => d.addEventListener('toggle', () => d.open && menus.forEach((o) => o !== d && (o.open = false))));
    document.addEventListener('click', (e) => { if (!e.target.closest('.filtre')) menus.forEach((d) => (d.open = false)); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const ouvert = menus.find((d) => d.open);
      if (ouvert) { ouvert.open = false; ouvert.querySelector('summary').focus(); }
    });
    $('filtres').addEventListener('change', () => {
      CLES.forEach((cle) => { APP.filtres[cle] = [...document.querySelectorAll(`input[name="${cle}"]:checked`)].map((i) => i.value); });
      appliquerFiltres();
    });
    $('filtres').addEventListener('submit', (e) => e.preventDefault());
    $('reinit').addEventListener('click', () => { APP.filtres = vides(); appliquerFiltres(); });
  }

  // Coche les cases et met à jour les résumés d'après APP.filtres
  function refleterFiltres() {
    CLES.forEach((cle) => {
      document.querySelectorAll(`input[name="${cle}"]`).forEach((i) => (i.checked = APP.filtres[cle].includes(i.value)));
      const v = APP.filtres[cle];
      $('v-' + cle).textContent = v.length ? v.map((x) => libelle(cle, x)).join(', ') : NOMS[cle][1];
      $('v-' + cle).closest('.filtre').classList.toggle('actif', v.length > 0);
    });
    $('reinit').hidden = !CLES.some((cle) => APP.filtres[cle].length);
  }

  async function appliquerFiltres() {
    refleterFiltres();
    const r = lireHash();
    history.replaceState(null, '', lien(r.vue, r.lot));
    majOnglets();
    if (await charger()) APP.vues[r.vue].afficher(null);
  }

  function libelleFiltres() {
    const parts = CLES.filter((cle) => APP.filtres[cle].length)
      .map((cle) => NOMS[cle][0] + ' : ' + APP.filtres[cle].map((x) => libelle(cle, x)).join(', '));
    return parts.length ? parts.join(' · ') : 'Aucun filtre (tout le lotissement)';
  }

  // ---------- hash : #vue[/lot=<code>][?phase=PH4&etat_travaux=A,B] ----------
  function query(f) {
    return CLES.filter((k) => f[k].length).map((k) => k + '=' + f[k].map(encodeURIComponent).join(',')).join('&');
  }
  const SANS_FILTRES = ['qc', 'clients', 'validation', 'pilotage', 'chantiers', 'dossiers', 'rapports', 'contentieux', 'relances', 'ecarts', 'acces', 'commentaires', 'historique', 'discussions']; // vues non filtrées : le hash ne porte pas les filtres des lots

  // ---------- onglet « Contrôles » : trois pages de vérification sous une même adresse ----------
  // #controles/<sous-page> ; [sous-page, vue, titre]. Les trois vues restent séparées (un JS chacune) :
  // seul l'accès est regroupé. Les anciennes adresses #ecarts, #validation et #qc sont traduites par
  // lireHash(), donc les liens déjà posés ailleurs (carte.js, clients.js, décisions du serveur) marchent.
  const CONTROLES = [
    ['affectations', 'ecarts', 'Affectations'],
    ['scans', 'validation', 'Scans OCR'],
    ['plan', 'qc', 'Données du plan'],
  ];
  const vueDeSous = (s) => (CONTROLES.find((c) => c[0] === s) || [])[1];
  const sousDeVue = (v) => (CONTROLES.find((c) => c[1] === v) || [])[0];
  // droit d'accès d'une sous-page : celui de sa vue, posé sur son lien par init() d'après /api/me/
  const controlePermis = (v) => {
    const a = document.querySelector(`.onglets a[data-vue="${v}"]`);
    return !!(a && !a.dataset.refuse);
  };
  let sousCourante = null; // dernière sous-page ouverte : l'onglet « Contrôles » y revient
  function sousDefaut() {
    if (sousCourante) return sousCourante;
    const c = CONTROLES.find(([, v]) => controlePermis(v));
    return c ? c[0] : CONTROLES[0][0]; // aucune permise : le routeur renverra vers la synthèse
  }
  // cle : la clé telle que lireHash() l'a lue. Le routeur réémet le hash pour le normaliser ; sans elle,
  // #contentieux/remb=<id> serait réécrit en /ref=<id> et la fiche de remboursement perdrait son adresse.
  function lien(vue, lot, filtres = APP.filtres, cle = null) {
    // pages de contrôle : une seule adresse, sans lot ni filtres
    const sous = vue === 'controles' ? sousDefaut() : sousDeVue(vue);
    // qc : #controles/plan/cle=<clé du constat> ouvre directement ce constat (voir collab/presence.js)
    if (sous) return '#controles/' + sous + (vue === 'qc' && lot && cle === 'cle' ? '/cle=' + encodeURIComponent(lot) : '');
    const q = query(filtres);
    const prefixe = { clients: '/ref=', dossiers: '/id=', contentieux: '/ref=' }[vue] || '/lot=';
    return '#' + vue + (lot ? (cle ? '/' + cle + '=' : prefixe) + encodeURIComponent(lot) : '')
      + (q && !SANS_FILTRES.includes(vue) ? '?' + q : '');
  }
  function lireHash() {
    const h = location.hash.slice(1), i = h.indexOf('?');
    const chemin = i < 0 ? h : h.slice(0, i);
    let [vue, extra, extra2] = chemin.split('/');
    // #controles/<sous-page> → la vue correspondante ; #controles seul ouvre la dernière sous-page vue
    if (vue === 'controles') { vue = vueDeSous(extra) || vueDeSous(sousDefaut()); extra = extra2 || ''; }
    // ref= : client (onglet Clients) ; id= : dossier (onglet Dossiers) ; remb= : fiche de remboursement
    // (onglet Contentieux) ; lot= : lotissement filtré ; lots= : plusieurs lots à la fois sur la carte
    // (codes séparés par des virgules) ; demande= : fiche de demande de remboursement (« nouvelle » ou
    // la référence du client) ; canal= / sujet= : portail Discussions.
    const m = extra && extra.match(/^(lot|lots|ref|id|remb|demande|cle|canal|sujet)=(.*)$/);
    return {
      vue: vue || 'synthese',
      lot: m ? decodeURIComponent(m[2]) : null,
      cle: m ? m[1] : null,
      qs: i < 0 ? null : h.slice(i + 1),
    };
  }
  // Filtres lus dans un lien : seules les valeurs connues de la config sont retenues
  function depuisQuery(qs) {
    const p = new URLSearchParams(qs), f = vides();
    CLES.forEach((cle) => {
      const permis = options(cle).map((o) => o.v);
      f[cle] = (p.get(cle) || '').split(',').filter((v) => permis.includes(v));
    });
    return f;
  }

  function majOnglets() {
    document.querySelectorAll('.onglets a').forEach((a) => a.setAttribute('href', lien(a.dataset.vue)));
  }

  // ---------- sous-barre de l'onglet « Contrôles » ----------
  function construireSousOnglets() {
    const n = $('sous-controles');
    n.innerHTML = CONTROLES.filter(([, v]) => controlePermis(v)).map(([s, v, titre]) =>
      `<a href="#controles/${s}" data-sous="${s}">${esc(titre)} <span class="so-nb" id="so-n-${v}" hidden></span></a>`).join('');
  }
  function majSousOnglets(sous) {
    const n = $('sous-controles');
    n.hidden = !sous;
    if (sous) n.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', a.dataset.sous === sous ? 'page' : 'false'));
  }
  // Pastilles : ce qu'il reste à traiter dans chaque sous-page. Relevé à l'entrée dans l'onglet,
  // pas plus d'une fois par demi-minute (les listes sont longues) ; muet en mode démonstration.
  const COMPTEURS = {
    ecarts: () => SIG.api('/api/ecarts/').then((d) => Object.values(d).reduce((t, l) => t + l.length, 0)),
    validation: () => SIG.api('/api/validations/').then((v) => v.filter((x) => !x.decision).length),
    qc: () => SIG.api('/api/qc/').then((d) => d.length),
  };
  let pastillesLe = 0;
  function majPastilles(force) {
    if (SIG.DEV) return;
    if (!force && Date.now() - pastillesLe < 30000) return;
    pastillesLe = Date.now();
    CONTROLES.forEach(([, v]) => {
      if (!controlePermis(v)) return;
      COMPTEURS[v]().then((n) => {
        const b = $('so-n-' + v);
        // aria-label : à la lecture vocale, « Scans OCR 603 à traiter » plutôt que « Scans OCR603 »
        if (b) { b.textContent = SIG.fmtNum(n); b.setAttribute('aria-label', SIG.fmtNum(n) + ' à traiter'); b.hidden = !n; }
      }).catch(() => { /* pastille facultative : la page reste utilisable */ });
    });
  }
  // après une décision (écart justifié, anomalie corrigée), les vues peuvent redemander les compteurs
  APP.controles = { majPastilles: () => majPastilles(true) };

  let vueCourante = null;
  async function router() {
    const r = lireHash();
    const onglet = document.querySelector(`.onglets a[data-vue="${r.vue}"]`);
    // data-hors-nav : vue accessible (fiche d'un dossier depuis la fiche client) mais absente de la barre
    // d'onglets — fondue dans une autre page. Un onglet simplement caché, lui, reste inaccessible.
    const horsNav = onglet && onglet.hasAttribute('data-hors-nav');
    if (!APP.vues[r.vue] || !onglet || onglet.dataset.refuse || (onglet.hidden && !horsNav)) {
      history.replaceState(null, '', lien('synthese'));
      return router();
    }
    // le hash porte les filtres (absents = aucun filtre) ; l'onglet QC, non filtré, ne les modifie pas
    if (!SANS_FILTRES.includes(r.vue)) {
      const f = r.qs === null ? vides() : depuisQuery(r.qs);
      if (query(f) !== query(APP.filtres)) {
        APP.filtres = f;
        refleterFiltres();
        if (!(await charger())) return;
      }
    }
    // hash normalisé avec les filtres courants, sans nouvelle entrée d'historique
    const attendu = lien(r.vue, r.lot, APP.filtres, r.cle);
    if (location.hash !== attendu) history.replaceState(null, '', attendu);
    const sous = sousDeVue(r.vue);
    if (sous) sousCourante = sous;
    majOnglets();
    majSousOnglets(sous);
    if (vueCourante !== r.vue) {
      vueCourante = r.vue;
      document.body.dataset.vue = r.vue;
      Object.keys(APP.vues).forEach((v) => ($('vue-' + v).hidden = v !== r.vue));
      // l'onglet marqué est celui de la barre : « Contrôles » pour les trois pages de vérification
      const actif = sous ? 'controles' : r.vue;
      document.querySelectorAll('.onglets a').forEach((a) => a.setAttribute('aria-current', a.dataset.vue === actif ? 'page' : 'false'));
      $('filtres').hidden = SANS_FILTRES.includes(r.vue);
      if (sous) majPastilles();
    }
    APP.vues[r.vue].afficher(r);
  }

  // ---------- chargement ----------
  let jeton = 0, devGeo, devKpi;
  // Recharge KPI + parcelles selon les filtres. Renvoie false si une requête plus récente l'a supplantée.
  async function charger() {
    const n = ++jeton;
    document.body.classList.add('occupe');
    $('compteur').textContent = 'Chargement…';
    try {
      erreur(null);
      let kpi, features;
      if (SIG.DEV) {
        // Mode dev : filtres appliqués côté client, KPI recalculés par la synthèse
        if (!devGeo) [devGeo, devKpi] = await Promise.all([SIG.api('/api/layers/parcelles/'), SIG.api('/api/kpi/')]);
        const f = APP.filtres, ok = (liste, v) => !liste.length || liste.includes(v);
        features = devGeo.features.filter(({ properties: p }) => ok(f.phase, p.code_phase) && ok(f.type_villa, p.type_villa)
          && ok(f.etat_travaux, p.etat_travaux) && ok(f.statut, p.statut_commercial));
        kpi = query(f) ? APP.vues.synthese.kpiDepuisParcelles(features, devKpi) : devKpi;
      } else {
        const q = query(APP.filtres);
        const [k, fc] = await Promise.all([SIG.api('/api/kpi/' + (q ? '?' + q : '')), SIG.api('/api/layers/parcelles/' + (q ? '?' + q : ''))]);
        kpi = k; features = fc.features || [];
      }
      if (n !== jeton) return false;
      APP.kpi = kpi; APP.features = features; APP.version++;
      $('date-calcul').textContent = dateLongue(kpi.calcule_le, true);
      const dates = features.map((f) => f.properties.date_situation).filter(Boolean).sort();
      // un filtre sans villa suivie (ex. phase sans travaux) garde la dernière date connue
      const situation = (kpi.travaux && kpi.travaux.date_situation) || dates[dates.length - 1];
      if (situation || $('date-travaux').textContent === '—') $('date-travaux').textContent = dateLongue(situation);
      $('compteur').textContent = APP.pl(features.length, 'lot affiché', 'lots affichés');
      return true;
    } catch (e) {
      if (n === jeton) { erreur('Impossible de charger les données : ' + e.message); $('compteur').textContent = '—'; }
      return false;
    } finally {
      if (n === jeton) document.body.classList.remove('occupe');
    }
  }

  function erreur(texte) {
    $('erreur').hidden = !texte;
    $('erreur').textContent = texte || '';
  }

  async function init() {
    // Mot de passe provisoire : l'API refuse tout sauf /api/me/ et /api/auth/ (backend/sig/invites.py). On ouvre
    // donc la fenêtre de changement AVANT de charger config et données ; compte.js recharge la page ensuite.
    const moi = await SIG.me();
    if (!moi.sans_identification && APP.compte) {
      const { provisoire } = await SIG.api('/api/auth/mot-de-passe/').catch(() => ({}));
      if (provisoire) {
        APP.me = moi; APP.roles = moi.roles || [moi.role];
        $('utilisateur').textContent = moi.username + ' · ' + APP.roles.join(', ');
        $('deconnexion').addEventListener('click', SIG.logout);
        $('compteur').textContent = '—';
        APP.compte.ouvrir(true);
        return;
      }
    }
    const [cfg, me] = await Promise.all([SIG.config(), SIG.me()]);
    APP.cfg = cfg; APP.me = me; APP.tech = me.role === 'technicien';
    APP.roles = me.roles || [me.role];
    document.title = cfg.projet.nom + ' — SIG';
    $('nom-projet').textContent = cfg.projet.nom;
    $('mo').textContent = cfg.projet.maitre_ouvrage || '—';
    $('utilisateur').textContent = me.sans_identification ? 'Phase de test · sans identification'
      : me.username + ' · ' + APP.roles.join(', ');
    $('deconnexion').addEventListener('click', SIG.logout);
    // onglets réservés : data-roles="a b" → visible si l'utilisateur a l'un de ces rôles
    // (les vues « hors barre » restent cachées : elles ne s'atteignent que par un lien)
    // Les onglets viennent de la matrice des accès (backend/sig/acces.py), renvoyée par /api/me/ : un onglet
    // absent de me.modules est masqué ET refusé par le routeur (data-refuse). Sans matrice (jeux d'essai du
    // mode démonstration), tout reste visible.
    const vuesPermises = me.modules ? new Set(me.modules.flatMap((m) => m.vues)) : null;
    APP.modules = me.modules || [];
    document.querySelectorAll('.onglets a[data-vue]').forEach((a) => {
      // Historique (hors matrice) : superadministrateur et direction, comme le refuse /api/journal/historique/
      const permis = !vuesPermises || vuesPermises.has(a.dataset.vue) || (a.dataset.vue === 'historique' && (me.superadmin || (APP.roles || []).includes('direction')));
      a.dataset.refuse = permis ? '' : '1';
      a.hidden = a.hasAttribute('data-hors-nav') || !permis;
    });
    // Onglet de groupe (« Contrôles ») : pas de vue à lui, donc refusé par le routeur ; il s'affiche dès
    // qu'une des vues qu'il réunit est permise, et ses sous-pages suivent les mêmes droits.
    document.querySelectorAll('.onglets a[data-groupe]').forEach((a) => {
      a.hidden = !a.dataset.groupe.split(' ').some(controlePermis);
    });
    construireSousOnglets();
    $('badge-demo').hidden = !SIG.DEV;
    construireFiltres();
    const r = lireHash();
    if (r.qs !== null && r.vue !== 'qc') APP.filtres = depuisQuery(r.qs);
    refleterFiltres();
    await charger();
    window.addEventListener('hashchange', router);
    if (APP.compte) APP.compte.init();   // mot de passe personnel (compte.js)
    router();
  }

  // Thème branché dès l'affichage, sans attendre l'API (un clic précoce ne doit pas être perdu)
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.theme button').forEach((b) => b.addEventListener('click', () => appliquerTheme(b.dataset.mode)));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (lireMode() === 'auto') document.dispatchEvent(new CustomEvent('sig:theme')); });
    // Passage d'un palier de taille de texte (style.css) : même redessin qu'au changement de thème, pour que
    // les grilles AG Grid reprennent la nouvelle taille.
    ['(max-width: 1600px)', '(max-width: 1440px)', '(max-width: 1280px)', '(max-width: 900px)'].forEach((q) =>
      matchMedia(q).addEventListener('change', () => document.dispatchEvent(new CustomEvent('sig:theme'))));
    appliquerTheme(lireMode());

    // Partage collaboratif : écouteur universel pour tous les boutons de copie de lien
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.btn-copier-lien');
      if (b) {
        e.preventDefault();
        e.stopPropagation();
        copierLien(b.dataset.lien || location.hash, b);
      }
    });
  });
    document.addEventListener('DOMContentLoaded', () => init().catch((e) => erreur("Impossible d'ouvrir l'application : " + e.message)));
})();
