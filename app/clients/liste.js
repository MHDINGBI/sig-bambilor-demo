// Espace client : chargement, indicateurs, filtres et grille AG Grid de la liste des clients.
import { ANOMALIES, comparerListe, comparerNaturel, comparerTexte, el, etat, filtres, GROUPES_FILTRES, initiales, KPI_GROUPES, LABELS_FILTRES, norm, situation, SITUATIONS, tauxPaye } from './commun.js';
import { ouvrirClient } from './fiche.js';
const { $, esc, num } = APP;
const fcfa = SIG.fmtFCFA;

let nonLus = {};
let pastilleFn = (n) => '';
let chargementNonLus = null;
let nonLusCharge = false;

export async function rafraichirNonLus() { if (SIG.DEMO) return;
  if (chargementNonLus) return chargementNonLus;
  chargementNonLus = (async () => {
    try {
      const { nonLusListe, pastilleHTML } = await import('/sig-bambilor-demo/app/collab/pastilles.js');
      pastilleFn = pastilleHTML;
      nonLus = (await nonLusListe('client')) || {};
      nonLusCharge = true;
      if (etat.grille && typeof etat.grille.refreshCells === 'function') {
        etat.grille.refreshCells({ force: true });
      }
    } catch (e) {
      nonLus = {};
    } finally {
      chargementNonLus = null;
    }
  })();
  return chargementNonLus;
}

function pastilleHTML(n) {
  return pastilleFn(n);
}

if (!SIG.DEMO) import('/sig-bambilor-demo/app/collab/pastilles.js').then((m) => { pastilleFn = m.pastilleHTML; }).catch(() => {});

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const h = window.location.hash || '';
    if (h === '#clients' || h.startsWith('#clients?')) {
      rafraichirNonLus();
    }
  });
  window.addEventListener('popstate', () => {
    const h = window.location.hash || '';
    if (h === '#clients' || h.startsWith('#clients?')) {
      rafraichirNonLus();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#cl-btn-retour')) {
      rafraichirNonLus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const ecranFiche = document.getElementById('cl-ecran-fiche');
      if (ecranFiche && !ecranFiche.hidden) {
        rafraichirNonLus();
      }
    }
  });
}

// Chargement initial depuis l'API
export async function charger() {
  const elListe = $('cl-liste');
  if (elListe) elListe.innerHTML = '<li class="vide">Chargement des clients…</li>';
  try {
    etat.donnees = await SIG.api('/api/clients/');
    majKPIsGlobaux();
    appliquerFiltres();
    rafraichirNonLus();
  } catch (e) {
    etat.donnees = null;
    if (elListe) elListe.innerHTML = `<li class="note erreur">Espace client indisponible : ${esc(e.message)}</li>`;
    const elCompte = $('cl-compte');
    if (elCompte) elCompte.textContent = 'Erreur de chargement';
  }
}

// Calcul et affichage des 5 mini-KPIs
export function majKPIsGlobaux() {
  if (!etat.donnees || !etat.donnees.clients) return;
  const cl = etat.donnees.clients;

  let nbSoldes = 0;
  let reliquatTot = 0;
  let nbRemb = 0;
  let soldeRembTot = 0;
  let nbContentieux = 0;
  let nbSansDossier = 0;

  cl.forEach((c) => {
    const sansDossier = !c.nb_dossiers || c.nb_dossiers === 0;
    if (sansDossier) {
      nbSansDossier++;
    }
    if (c.prix_vente > 0 && (c.reliquat <= 0 || c.total_verse >= c.prix_vente)) {
      nbSoldes++;
    }
    if (c.reliquat > 0) {
      reliquatTot += c.reliquat;
    }
    if (c.a_remboursement) {
      nbRemb++;
      soldeRembTot += (c.solde_remboursement || 0);
    }
    if (c.contentieux) {
      nbContentieux++;
    }
  });

  const elSoldes = $('cl-kpi-soldes');
  if (elSoldes) elSoldes.textContent = `${num(nbSoldes)} (${Math.round((nbSoldes / (cl.length || 1)) * 100)}%)`;

  const elReliquats = $('cl-kpi-reliquats');
  if (elReliquats) elReliquats.textContent = `${Math.round(reliquatTot / 1e6)} M`;

  const elSansDossier = $('cl-kpi-sans-dossier');
  if (elSansDossier) elSansDossier.textContent = num(nbSansDossier);

  const elRemb = $('cl-kpi-remb');
  if (elRemb) elRemb.textContent = `${num(nbRemb)} (${Math.round(soldeRembTot / 1e6)} M)`;

  const elContentieux = $('cl-kpi-contentieux');
  if (elContentieux) elContentieux.textContent = `${num(nbContentieux)}`;

  const scannes = cl.filter((x) => x.nb_documents).length;
  const elResume = $('cl-resume');
  if (elResume) {
    elResume.textContent = `${APP.pl(cl.length, 'client', 'clients')} · ${num(scannes)} avec dossier scanné lu · `
      + `${num(nbSansDossier)} sans dossier · ${num(nbRemb)} en remboursement / désistement · `
      + `${APP.pl((etat.donnees.documents_non_rattaches || []).length, 'document non rattaché', 'documents non rattachés')}.`;
  }
}

// Application des filtres multicritères combinés
export function obtenirClientsFiltres() {
  if (!etat.donnees || !etat.donnees.clients) return [];
  const elQ = $('cl-q');
  const q = norm(elQ ? elQ.value.trim() : '');

  if (filtres.ged.has('non-rattaches')) {
    return null;
  }

  return etat.donnees.clients.filter((c) => {
    // 1. Recherche texte
    if (q) {
      const texte = norm(`${c.nom || ''} ${(c.lots || []).join(' ')} ${(c.phases || []).join(' ')} ${c.ref || ''} ${(c.numeros_dossiers || []).join(' ')} ${(c.payeurs || []).join(' ')}`);
      if (!texte.includes(q)) return false;
    }

    // 1.5 Filtre Dossier
    if (filtres.dossier.size > 0) {
      let matchDossier = false;
      const sansDossier = !c.nb_dossiers || c.nb_dossiers === 0;
      const avecDossier = (c.nb_dossiers || 0) > 0;
      const sansLot = avecDossier && (!c.lots || !c.lots.length);
      if (filtres.dossier.has('sans-dossier') && sansDossier) matchDossier = true;
      if (filtres.dossier.has('avec-dossier') && avecDossier) matchDossier = true;
      if (filtres.dossier.has('sans-lot') && sansLot) matchDossier = true;
      if (filtres.dossier.has('plusieurs-lots') && (c.lots || []).length > 1) matchDossier = true;
      if (filtres.dossier.has('plusieurs-contrats') && c.nb_contrats > 1) matchDossier = true;
      if (filtres.dossier.has('sans-contrat') && c.nb_sans_contrat > 0) matchDossier = true;
      if (filtres.dossier.has('contrat-bloque') && c.nb_contrat_bloque > 0) matchDossier = true;
      if (filtres.dossier.has('desiste') && c.nb_desistes > 0) matchDossier = true;
      if (!matchDossier) return false;
    }

    // 1.6 Filtre Livraison (lots actifs, situation travaux courante)
    if (filtres.livraison.size > 0) {
      let matchLivraison = false;
      if (filtres.livraison.has('livree') && c.nb_livres > 0) matchLivraison = true;
      if (filtres.livraison.has('sous-reserve') && c.nb_sous_reserve > 0) matchLivraison = true;
      if (filtres.livraison.has('non-livree') && c.nb_non_livres > 0) matchLivraison = true;
      if (filtres.livraison.has('sans-pv') && c.nb_livres_sans_pv > 0) matchLivraison = true;
      if (!matchLivraison) return false;
    }

    // 2. Filtre Phase
    if (filtres.phase.size > 0) {
      let matchPhase = false;
      if (filtres.phase.has('sans-lot') && (!c.lots || !c.lots.length)) matchPhase = true;
      if (c.phases && c.phases.some((p) => filtres.phase.has(p))) matchPhase = true;
      if (!matchPhase) return false;
    }

    // 3. Filtre Compte
    if (filtres.compte.size > 0) {
      let matchCompte = false;
      const estSolde = c.prix_vente > 0 && (c.reliquat <= 0 || c.total_verse >= c.prix_vente);
      const aReliquat = c.reliquat > 0;
      if (filtres.compte.has('solde') && estSolde) matchCompte = true;
      if (filtres.compte.has('impaye') && aReliquat) matchCompte = true;
      if (!matchCompte) return false;
    }

    // 4. Filtre Vigilance
    if (filtres.vigilance.size > 0) {
      let matchVigilance = false;
      if (filtres.vigilance.has('remboursement') && c.a_remboursement) matchVigilance = true;
      if (filtres.vigilance.has('contentieux') && c.contentieux) matchVigilance = true;
      if (filtres.vigilance.has('alertes') && c.nb_alertes > 0) matchVigilance = true;
      if (!matchVigilance) return false;
    }

    // 5. Filtre GED
    if (filtres.ged.size > 0) {
      let matchGed = false;
      if (filtres.ged.has('scanne') && c.nb_documents > 0) matchGed = true;
      if (filtres.ged.has('sans-doc') && !c.nb_documents) matchGed = true;
      if (!matchGed) return false;
    }

    return true;
  });
}

// Mettre à jour l'affichage des filtres, des groupes et des pilules actives
function majAffichageFiltres() {
  document.querySelectorAll('.cl-chip[data-groupe]').forEach((chip) => {
    const g = chip.dataset.groupe;
    const v = chip.dataset.valeur;
    if (filtres[g] && filtres[g].has(v)) {
      chip.classList.add('actif');
    } else {
      chip.classList.remove('actif');
    }
  });

  // Famille de filtres : son libellé passe au bordeaux dès qu'un de ses filtres est actif.
  document.querySelectorAll('.cl-filtre-pod[data-groupe]').forEach((pod) => {
    const jeu = filtres[pod.dataset.groupe];
    pod.classList.toggle('actif', Boolean(jeu) && jeu.size > 0);
  });

  // Les cases d'indicateurs de l'en-tête agissent comme des raccourcis : elles s'allument quand
  // le filtre qu'elles posent est actif.
  KPI_GROUPES.forEach(([selecteur, g, v]) => {
    const item = document.querySelector(selecteur);
    if (item) item.classList.toggle('actif', Boolean(filtres[g]) && filtres[g].has(v));
  });

  const conteneurPills = $('cl-pills-actives');
  if (!conteneurPills) return;

  const pills = [];
  GROUPES_FILTRES.forEach((g) => {
    if (!filtres[g]) return;
    filtres[g].forEach((v) => {
      const libelle = (LABELS_FILTRES[g] && LABELS_FILTRES[g][v]) || v;
      pills.push(`<button type="button" class="cl-pill" data-groupe="${g}" data-valeur="${v}" title="Supprimer ce filtre">
        <span>${esc(libelle)}</span> <span class="cl-pill-croix">&times;</span>
      </button>`);
    });
  });

  conteneurPills.innerHTML = pills.join('');

  // La ligne des pilules n'existe que s'il y a des filtres à montrer : sinon elle laisse un
  // filet vide en travers de la barre.
  const info = $('cl-filtres-info');
  if (info) info.hidden = pills.length === 0;

  // « Effacer tout » n'a de sens que s'il y a quelque chose à effacer.
  const reset = $('cl-btn-reinit');
  if (reset) {
    const recherche = $('cl-q');
    reset.hidden = pills.length === 0 && !(recherche && recherche.value.trim());
  }
}

export function appliquerFiltres() {
  majAffichageFiltres();

  // Deux jeux de données cohabitent dans la page : les acquéreurs (grille) et les documents scannés
  // orphelins (relevé simple). C'est un état de la page, pas un contenu de grille.
  const orphelins = filtres.ged.has('non-rattaches');
  const elGrille = $('cl-grille');
  const elOrphelins = $('cl-orphelins');
  if (elGrille) elGrille.hidden = orphelins;
  if (elOrphelins) elOrphelins.hidden = !orphelins;
  if (orphelins) {
    dessinerDocsNonRattaches();
    return;
  }

  const liste = obtenirClientsFiltres();
  const elCompte = $('cl-compte');
  if (elCompte) {
    elCompte.textContent = `${APP.pl(liste.length, 'client', 'clients')} trouvé${liste.length > 1 ? 's' : ''}`;
  }

  dessinerGrille(liste);
}

// Rendu de la liste des documents orphelins (hors grille : autre jeu de données, autre colonnes)
function dessinerDocsNonRattaches() {
  const elQ = $('cl-q');
  const q = norm(elQ ? elQ.value.trim() : '');
  const docs = (etat.donnees.documents_non_rattaches || []).filter((d) => !q || norm(d.chemin + ' ' + d.code_lot).includes(q));
  const elCompte = $('cl-compte');
  if (elCompte) elCompte.textContent = APP.pl(docs.length, 'document orphelin', 'documents orphelins');

  const tbody = $('cl-orphelins-corps');
  if (!tbody) return;

  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="vide" style="text-align:center;padding:24px;">Aucun document orphelin trouvé.</td></tr>';
    return;
  }

  tbody.innerHTML = docs.map((d) => `
    <tr class="tr-encours">
      <td>
        <div class="cl-row-client">
          <div class="cl-row-avatar tr-encours">DOC</div>
          <div class="cl-row-client-info">
            <strong class="cl-row-nom">${esc(d.chemin.split('/').pop().replace(/\.pdf$/i, ''))}</strong>
            <span class="cl-row-ref">${esc(d.categorie)}</span>
          </div>
        </div>
      </td>
      <td>${d.code_lot ? `<span class="cl-badge-lot">Lot ${esc(d.code_lot)}</span>` : '<span class="aide">Sans lot</span>'}</td>
      <td class="n">${num(d.nb_pages || 0)}</td>
      <td><span class="cl-badge doux">À rattacher</span></td>
      <td class="c">
        <button type="button" class="bouton micro" data-doc="${d.id}" data-page="1">Voir PDF</button>
      </td>
    </tr>`).join('');
}

// ---------- LISTE : GRILLE DE DONNÉES ----------
// La liste est une grille (AG Grid) et non plus un tableau écrit à la main : filtres par colonne,
// tri sur plusieurs niveaux (Maj+clic), largeurs ajustables à la souris. La **présentation** reste
// celle du tableau d'origine : toute la liste rendue dans le flux de la page (pas de pagination,
// pas de hauteur imposée) et des colonnes qui occupent exactement la largeur disponible.
// Les règles de tri sont celles de la grille des lots (chantiers.js) : une seule façon de trier
export function themeGrille() {
  return agGrid.themeQuartz.withParams({
    backgroundColor: APP.jeton('--papier'),
    foregroundColor: APP.jeton('--encre'),
    // En-tête au fond du sol, comme le <thead> du tableau d'origine.
    headerBackgroundColor: APP.jeton('--sol'),
    headerTextColor: APP.jeton('--gris'),
    borderColor: APP.jeton('--trait'),
    accentColor: APP.jeton('--accent'),
    fontFamily: APP.jeton('--corps'),
    fontSize: APP.taillePoliceGrille(),
    // Densité du tableau d'origine : pas d'air ajouté par le thème, et pas d'alternance de fond
    // (le tableau précédent avait des lignes toutes de la même couleur).
    cellHorizontalPadding: 10,
    headerHeight: 34,
    oddRowBackgroundColor: APP.jeton('--papier'),
  });
}

export function agGridLocaleFr() {
  return {
    searchOoo: 'Recherche…', noRowsToShow: 'Aucun client', loadingOoo: 'Chargement…', filterOoo: 'Filtrer…',
    equals: 'Égal à', notEqual: 'Différent de', contains: 'Contient', notContains: 'Ne contient pas',
    startsWith: 'Commence par', endsWith: 'Se termine par', blank: 'Vide', notBlank: 'Non vide',
    lessThan: 'Inférieur à', greaterThan: 'Supérieur à', inRange: 'Entre',
    applyFilter: 'Appliquer', resetFilter: 'Réinitialiser', clearFilter: 'Effacer',
    andCondition: 'ET', orCondition: 'OU', columns: 'Colonnes', pinColumn: 'Épingler',
    page: 'Page', more: 'plus', to: 'à', of: 'sur',
    next: 'Suivant', last: 'Dernier', first: 'Premier', previous: 'Précédent',
    pageSizeSelectorLabel: 'Lignes par page :', ariaPageSizeSelectorLabel: 'Lignes par page',
  };
}

// `width` = largeur souhaitée, `minWidth` = plancher. Les deux servent à `autoSizeStrategy:
// fitGridWidth`, qui répartit la largeur disponible entre les colonnes au prorata : la grille occupe
// alors exactement la largeur de la page, sans vide à droite ni barre de défilement horizontale.
// Corollaire : les planchers doivent tenir dans une fenêtre courante, sinon les colonnes débordent.
function colonnes() {
  const defs = [];

  // N° de dossier : l'import commercial ne les alimente pas encore (0 sur 876 acquéreurs). La colonne
  // n'apparaît que le jour où la saisie en ligne en produit — même règle que la grille des lots.
  if (etat.donnees.clients.some((c) => (c.numeros_dossiers || []).length)) {
    defs.push({
      field: 'numeros_dossiers', headerName: 'N° dossier', width: 150, pinned: 'left',
      comparator: comparerListe, filterValueGetter: (p) => (p.data.numeros_dossiers || []).join(', '),
      cellRenderer: (p) => el('span', 'aide', (p.data.numeros_dossiers || []).join(', ') || '—'),
    });
  }

  defs.push(
    {
      // Prénoms et nom en deux colonnes, comme le tableau des remboursements (APP.noms : prénoms avec
      // majuscule initiale, nom en capitales). Une raison sociale (« CDC ») est entière dans Prénoms.
      // Plusieurs titulaires : le premier est affiché, les autres dans le badge « +N ».
      field: 'nom', headerName: 'Prénoms', width: 230, minWidth: 180, comparator: comparerTexte,
      valueGetter: (p) => APP.noms.identite(p.data.nom, null, null, p.data.nom_famille).prenom,
      filterValueGetter: (p) => norm(p.data.nom),
      cellRenderer: (p) => {
        const c = p.data;
        const complet = APP.noms.nomPropre(c.nom, c.nom_famille) || c.ref;
        const wrap = el('div', 'cl-row-client');
        const avatar = el('div', 'cl-row-avatar ' + SITUATIONS[situation(c)].classe, initiales(c.nom || c.ref));
        // Le code acquéreur (pseudonyme de 10 caractères) n'est plus affiché sous le nom : il ne servait
        // à rien à l'écran et occupait une ligne à *chaque* ligne du tableau. Il reste dans l'infobulle
        // des deux éléments et dans l'export CSV, où il est la clé.
        avatar.title = complet + ' — réf. ' + c.ref;
        wrap.appendChild(avatar);
        const info = el('div', 'cl-row-client-info');
        const nom = el('strong', 'cl-row-nom', p.value || c.ref);
        nom.title = complet + ' — réf. ' + c.ref;
        const pastille = pastilleHTML(nonLus[c.ref]);
        if (pastille) nom.insertAdjacentHTML('beforeend', pastille);
        info.appendChild(nom);
        const tit = APP.noms.titulaires(c.nom, c.nom_famille);
        if (tit.length > 1) {
          const autres = el('span', 'cl-cotit', '+' + (tit.length - 1));
          autres.title = 'Co-titulaire' + (tit.length > 2 ? 's' : '') + ' : ' + tit.slice(1).map(APP.noms.unTitulaire).join(', ');
          info.appendChild(autres);
        }
        wrap.appendChild(info);
        return wrap;
      },
    },
    {
      // À nom égal, les prénoms départagent ; les raisons sociales (sans nom) vont en fin de tri croissant.
      colId: 'nom_famille', headerName: 'Nom', width: 150, minWidth: 120,
      valueGetter: (p) => APP.noms.nomFamille(p.data.nom, p.data.nom_famille),
      comparator: (a, b, na, nb) => (!a || !b ? (a ? -1 : b ? 1 : 0) : APP.noms.comparer(a, b))
        || (na && nb ? APP.noms.comparer(na.data.nom, nb.data.nom) : 0),
    },
    {
      field: 'lots', headerName: 'Lot(s)', width: 125, minWidth: 115, comparator: comparerListe,
      filterValueGetter: (p) => (p.data.lots || []).join(', '),
      cellRenderer: (p) => {
        const c = p.data;
        const wrap = el('div', 'cl-row-badges-wrap');
        if (!c.nb_dossiers) { wrap.appendChild(el('span', 'cl-badge alerte', 'Sans dossier')); return wrap; }
        // « Sans lot » et non « Dossier sans lot » : la colonne s'appelle Lot(s), le sens est déjà
        // porté par l'en-tête, et ce libellé long débordait de la colonne.
        if (!(c.lots || []).length) {
          const b = el('span', 'cl-badge vigilance', 'Sans lot');
          b.title = 'Le dossier commercial n’a encore aucun lot affecté';
          wrap.appendChild(b);
          return wrap;
        }
        // Un acquéreur peut détenir des dizaines de lots (CDC : 43, CEFOREP : 18) : un badge par lot
        // faisait une ligne de 1 700 px de haut. On en montre trois, le reste tient dans l'infobulle.
        // Pas de préfixe « Lot » : l'en-tête de la colonne le dit déjà, et le badge deux fois plus
        // court divise par deux le nombre de lignes occupées.
        const MAX_LOTS = 3;
        c.lots.slice(0, MAX_LOTS).forEach((l) => {
          const b = el('span', 'cl-badge-lot', String(l));
          b.title = 'Lot ' + l;
          wrap.appendChild(b);
        });
        if (c.lots.length > MAX_LOTS) {
          const plus = el('span', 'cl-badge-lot', '+' + (c.lots.length - MAX_LOTS));
          plus.title = c.lots.map((l) => 'Lot ' + l).join(' · ');
          wrap.appendChild(plus);
        }
        return wrap;
      },
    },
    {
      field: 'phases', headerName: 'Phase', width: 88, minWidth: 85, comparator: comparerListe,
      filterValueGetter: (p) => (p.data.phases || []).join(', '),
      cellRenderer: (p) => {
        const wrap = el('div', 'cl-row-badges-wrap');
        const ph = p.data.phases || [];
        if (!ph.length) { wrap.appendChild(el('span', 'aide', '—')); return wrap; }
        ph.forEach((x) => wrap.appendChild(el('span', 'cl-badge-phase phase-' + String(x).toLowerCase(), x)));
        return wrap;
      },
    },
    // Les planchers des colonnes de montants sont calés sur « 49 900 000 FCFA » : en dessous, le prix
    // est tronqué à l'affichage (constaté à 121 px de colonne).
    {
      field: 'prix_vente', headerName: 'Prix Vente', width: 150, minWidth: 140, type: 'numericColumn',
      valueFormatter: (p) => (p.value ? fcfa(p.value) : '—'),
    },
    {
      field: 'total_verse', headerName: 'Total Versé', width: 185, minWidth: 175, type: 'numericColumn',
      cellRenderer: (p) => {
        const c = p.data;
        const taux = tauxPaye(c);
        const solde = situation(c) === 'solde';
        const wrap = el('div', 'cl-row-verse-wrap');
        const chiffres = el('div', 'cl-row-verse-chiffres');
        chiffres.appendChild(el('strong', null, c.total_verse ? fcfa(c.total_verse) : '0 FCFA'));
        chiffres.appendChild(el('span', 'cl-row-taux' + (solde ? ' solde' : ''), taux + '%'));
        wrap.appendChild(chiffres);
        const barre = el('div', 'cl-progression-barre cl-progression-barre-micro');
        const jauge = el('div', 'cl-progression-jauge' + (solde ? ' cl-jauge-pleine' : ''));
        jauge.style.width = taux + '%';
        barre.appendChild(jauge);
        wrap.appendChild(barre);
        return wrap;
      },
    },
    {
      field: 'reliquat', headerName: 'Reliquat', width: 150, minWidth: 140, type: 'numericColumn',
      cellRenderer: (p) => {
        if (!p.data.nb_dossiers) return el('span', 'aide', '0 dossier');
        return (p.value || 0) > 0 ? el('strong', 'cl-reliquat-val', fcfa(p.value)) : el('span', 'cl-solde-val', 'Soldé');
      },
    },
    {
      field: 'statuts', headerName: 'Statut & Risque', width: 185, minWidth: 175, comparator: comparerListe,
      filterValueGetter: (p) => (p.data.statuts || []).join(', '),
      cellRenderer: (p) => {
        const c = p.data;
        const wrap = el('div', 'cl-badges');
        wrap.appendChild(el('span', 'cl-badge ' + SITUATIONS[situation(c)].badge, SITUATIONS[situation(c)].libelle));
        if (c.a_remboursement) {
          const b = el('span', 'cl-badge cl-badge-remb', 'Remb. ' + (c.solde_remboursement ? '(' + Math.round(c.solde_remboursement / 1e6) + 'M)' : ''));
          b.title = 'Désistement — solde restant à rembourser : ' + fcfa(c.solde_remboursement);
          wrap.appendChild(b);
        }
        if (c.contentieux) wrap.appendChild(el('span', 'cl-badge alerte', 'Contentieux'));
        if (c.nb_sans_contrat) {
          const b = el('span', 'cl-badge vigilance', c.nb_sans_contrat > 1 ? c.nb_sans_contrat + ' sans contrat' : 'Sans contrat');
          b.title = 'Dossier(s) actif(s) sans contrat signé : ' + c.nb_sans_contrat
            + (c.nb_contrat_bloque ? ' — dont ' + c.nb_contrat_bloque + ' sous le seuil de versement (contrat impossible)' : '');
          wrap.appendChild(b);
        }
        if (c.nb_non_actifs) {
          const b = el('span', 'cl-badge doux', c.nb_non_actifs > 1 ? c.nb_non_actifs + ' inactifs' : 'Inactif');
          b.title = 'Dossier(s) désisté(s), doublon ou non trouvé : ' + c.nb_non_actifs;
          wrap.appendChild(b);
        }
        return wrap;
      },
    },
    {
      colId: 'anomalies', headerName: 'Anomalies', width: 120, minWidth: 110, filter: 'agNumberColumnFilter',
      // On trie et on filtre sur le NOMBRE d'anomalies ; les libellés des codes vont dans l'infobulle.
      valueGetter: (p) => (p.data.anomalies || []).length,
      comparator: (a, b) => a - b,
      cellRenderer: (p) => {
        if (!p.value) return el('span', 'aide', '—');
        const s = el('span', 'cl-badge vigilance', p.value > 1 ? p.value + ' anomalies' : '1 anomalie');
        s.title = (p.data.anomalies || []).map((a) => ANOMALIES[a] || a).join(' · ');
        return s;
      },
    },
    {
      colId: 'ged', headerName: 'GED / OCR', width: 120, minWidth: 110,
      valueGetter: (p) => p.data.nb_documents,
      cellRenderer: (p) => {
        const c = p.data;
        const wrap = el('div', 'cl-badges');
        if (c.nb_documents) {
          const b = el('span', 'cl-badge doux', 'Scans ' + c.nb_documents);
          b.title = c.nb_documents + ' document(s) scanné(s), ' + (c.pages_lues || 0) + ' page(s) lue(s)';
          wrap.appendChild(b);
        } else {
          wrap.appendChild(el('span', 'cl-badge doux', 'Non scanné'));
        }
        if (c.nb_alertes) {
          const b = el('span', 'cl-badge vigilance', 'Alertes ' + c.nb_alertes);
          b.title = c.nb_alertes + ' écart(s) relevé(s) par la lecture automatique';
          wrap.appendChild(b);
        }
        return wrap;
      },
    },
  );

  // Source : classeur Excel du pôle commercial ou saisie en ligne. Constante tant que la saisie n'a rien
  // produit : la colonne n'apparaît que si les données la rendent utile.
  if (new Set(etat.donnees.clients.flatMap((c) => c.sources || [])).size > 1) {
    defs.push({
      field: 'sources', headerName: 'Source', width: 110, comparator: comparerListe,
      filterValueGetter: (p) => (p.data.sources || []).join(', '),
      cellRenderer: (p) => {
        const wrap = el('div', 'cl-badges');
        (p.data.sources || []).forEach((s) => wrap.appendChild(
          el('span', 'cl-badge ' + (s === 'excel' ? 'doux' : 'cl-badge-succes'), s === 'excel' ? 'Excel' : 'saisi'),
        ));
        return wrap;
      },
    });
  }

  // Actions : **trois boutons au maximum**, comme le tableau d'origine. Au-delà, le quatrième passe
  // à la ligne et se fait couper par la hauteur de ligne (15 clients sans lot étaient dans ce cas).
  // Conséquence : quand le dossier n'a pas encore de lot, « Affecter » prend la place du lien
  // « Dossier » — c'est l'action prioritaire, et la fiche du dossier reste atteignable par la fiche
  // client, elle-même ouverte en cliquant la ligne.
  defs.push({
    colId: 'actions', headerName: 'Actions', width: 225, minWidth: 220, pinned: 'right', sortable: false, filter: false,
    cellRenderer: (p) => {
      const c = p.data;
      const wrap = el('div', 'cl-actions-grid');
      const bouton = (libelle, action, classes, titre) => {
        const b = el('button', 'bouton ' + classes, libelle);
        b.type = 'button';
        b.dataset.action = action;
        b.dataset.ref = c.ref;
        if (c.premier_dossier_id) b.dataset.dossierId = c.premier_dossier_id;
        b.title = titre;
        return b;
      };
      wrap.appendChild(bouton('Fiche', 'voir-fiche', 'micro', 'Ouvrir la fiche du client, ses documents et sa GED'));
      if (!c.nb_dossiers) {
        wrap.appendChild(bouton('+ Dossier', 'creer-dossier', 'secondaire micro', 'Affecter un lot et créer le dossier commercial'));
      } else if (!(c.lots || []).length) {
        wrap.appendChild(bouton('Affecter', 'affecter-lot', 'secondaire micro', 'Affecter un lot à ce dossier, qui n’en a aucun'));
      } else {
        const a = el('a', 'bouton secondaire micro', 'Dossier');
        a.href = '#dossiers/id=' + c.premier_dossier_id;
        a.title = c.nb_dossiers > 1
          ? `Ouvrir le premier de ses ${c.nb_dossiers} dossiers (versements, reçus, pièces)`
          : 'Ouvrir le dossier commercial (versements, reçus, pièces)';
        wrap.appendChild(a);
      }
      const rel = el('button', 'bouton secondaire micro', 'Relevé');
      rel.type = 'button';
      rel.dataset.genDoc = 'releve';
      rel.dataset.dossierId = c.premier_dossier_id || '';
      rel.disabled = !c.nb_dossiers;
      rel.title = c.nb_dossiers > 1 ? 'Relevé de compte du premier de ses contrats' : 'Relevé de compte';
      wrap.appendChild(rel);
      return wrap;
    },
  });
  return defs;
}

// ---------- tri multi-niveaux ----------
// AG Grid empile les niveaux de tri avec Maj+clic (multiSortKey). On affiche ce tri et on le rend
// annulable en un clic : sans cela, deux niveaux actifs demandent quatre clics d'en-tête pour disparaître.
function majBarreTri() {
  const zone = $('cl-tri');
  if (!zone || !etat.grille) return;
  const niveaux = etat.grille.getColumnState().filter((c) => c.sort).sort((a, b) => a.sortIndex - b.sortIndex);
  if (!niveaux.length) {
    zone.innerHTML = '';
    return;
  }
  const titres = niveaux.map((c) => {
    const col = etat.grille.getColumn(c.colId);
    return esc((col && col.getColDef().headerName) || c.colId) + ' ' + (c.sort === 'asc' ? '↑' : '↓');
  });
  zone.innerHTML = `<span class="cl-tri-aide">Tri${niveaux.length > 1 ? ' sur ' + niveaux.length + ' niveaux' : ''} : ${titres.join(' puis ')}</span>
    <button type="button" class="lien" id="cl-tri-effacer">Effacer le tri</button>`;
  const b = $('cl-tri-effacer');
  if (b) b.addEventListener('click', () => {
    etat.grille.applyColumnState({ defaultState: { sort: null } });
    majBarreTri();
  });
}

// ---------- saisie assistée dans les menus de filtre des en-têtes ----------
// Chaque menu de filtre porte un champ « Contient… » où l'on tape un mot sans savoir lesquels
// existent. On y accroche la liste des valeurs réellement présentes dans la colonne : le navigateur
// réduit la liste à la frappe. C'est le filtre automatique d'un tableur, sans code de liste à écrire.
//
// Pour les colonnes à tableau (lot(s), phase, statut…), on propose les valeurs **élément par
// élément** : le filtre teste « contient » sur la liste jointe, donc c'est « PH2 » qu'on tape,
// jamais « PH1, PH2 ».
const CHAMP_SUGGERE = {
  nom: 'nom', lots: 'lots', phases: 'phases', statuts: 'statuts',
  numeros_dossiers: 'numeros_dossiers', sources: 'sources',
};

function valeursColonne(colId) {
  const champ = CHAMP_SUGGERE[colId];
  if (!champ || !etat.donnees || !etat.donnees.clients) return [];
  const uniques = new Set();
  etat.donnees.clients.forEach((c) => {
    const v = c[champ];
    if (Array.isArray(v)) v.forEach((x) => x !== null && x !== '' && uniques.add(String(x)));
    else if (v !== null && v !== undefined && v !== '') uniques.add(String(v));
  });
  // Les numéros de lot se lisent dans l'ordre naturel (2 avant 10) et non dans l'ordre alphabétique.
  return [...uniques].sort(colId === 'lots' ? comparerNaturel : comparerTexte);
}

function suggererValeursColonne(e) {
  const valeurs = valeursColonne(e.column.getColId());
  if (!valeurs.length) return;
  // AG Grid monte le champ du filtre juste après l'événement : on attend le tour suivant.
  setTimeout(() => {
    const champs = document.querySelectorAll('.ag-filter input.ag-text-field-input');
    if (!champs.length) return;
    let liste = document.getElementById('cl-suggestions-colonne');
    if (!liste) {
      liste = document.createElement('datalist');
      liste.id = 'cl-suggestions-colonne';
      document.body.appendChild(liste);
    }
    liste.innerHTML = valeurs.map((v) => `<option value="${esc(v)}"></option>`).join('');
    champs.forEach((champ) => champ.setAttribute('list', liste.id));
  }, 0);
}

function dessinerGrille(liste) {
  if (!nonLusCharge && !chargementNonLus) {
    rafraichirNonLus();
  }
  if (etat.grille) {
    etat.grille.setGridOption('rowData', liste);
    return;
  }
  etat.grille = agGrid.createGrid($('cl-grille'), {
    columnDefs: colonnes().map(col => {
      const id = col.colId || col.field;
      if (SIG.DEMO && ['nom_famille', 'numeros_dossiers', 'anomalies', 'ged'].includes(id)) return { ...col, hide: true };
      if (SIG.DEMO && id === 'nom') return { ...col, headerName: 'Client', width: 190, minWidth: 190, valueGetter: p => p.data.nom };
      if (SIG.DEMO && id === 'actions') return { ...col, width: 90, minWidth: 90 };
      return { ...col, minWidth: Math.max(col.minWidth || 0, col.width || 100) };
    }),
    rowData: liste,
    theme: themeGrille(),
    localeText: agGridLocaleFr(),
    // Présentation du tableau d'origine : aucune limite par nombre, aucune hauteur imposée — toute la
    // liste est rendue dans le flux de la page et c'est la page qui défile.
    domLayout: 'autoHeight',
    // Conserver les largeurs lisibles : sur petit écran, défilement horizontal plutôt que colonnes comprimées.
    defaultColDef: { sortable: true, filter: true, resizable: true, floatingFilter: false, wrapText: false, autoHeight: false },
    multiSortKey: 'shift', // cumul des niveaux au Maj+clic (défaut AG Grid, rendu explicite ici)
    onSortChanged: majBarreTri,
    // Saisie assistée dans les menus de filtre : voir `suggererValeursColonne`.
    onFilterOpened: suggererValeursColonne,
    onRowClicked: (e) => {
      // Les boutons et liens d'une ligne gardent leur propre action : seul un clic « à vide » ouvre la fiche.
      if (e.event && e.event.target.closest('button, a')) return;
      ouvrirClient(e.data.ref);
    },
    suppressCellFocus: true,
    // Hauteur stable, suffisante pour l'avatar et la jauge de versement.
    rowHeight: 40,
    // Identifiant stable : au filtrage, AG Grid réutilise les lignes qui restent au lieu de tout
    // recréer (mesuré : ≈ 150 ms de blocage en moins sur un retour à la liste complète).
    getRowId: (p) => p.data.ref,
    // Les transitions de lignes coûtent cher sur 876 lignes (mesuré : ≈ 400 ms de blocage) :
    // une table de données n'a rien à gagner à faire glisser ses lignes.
    animateRows: false,
    getRowClass: (p) => SITUATIONS[situation(p.data)].classe,
  });
  majBarreTri(); // la barre explique le tri la première fois qu'on arrive sur la page
}
