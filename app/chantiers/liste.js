// Chantiers — Suivi des lots : grille AG Grid (bureau) et cartes (mobile).
import { aRole, afficheurs, cfg, compteurs, dateFr, etat, fcfa, listeFiltree, phaseCouleur } from './commun.js';
const { $, esc, num, pct, pl } = APP;

let nonLus = {};
let pastilleFn = (n) => '';
let chargementNonLus = null;
let besoinRafraichissement = true;

export async function rafraichirNonLus() {
  if (chargementNonLus) return chargementNonLus;
  chargementNonLus = (async () => {
    try {
      const { nonLusListe, pastilleHTML } = await import('/sig-bambilor-demo/app/collab/pastilles.js');
      pastilleFn = pastilleHTML;
      nonLus = (await nonLusListe('chantier')) || {};
      if (etat.grille && typeof etat.grille.refreshCells === 'function') {
        etat.grille.refreshCells({ force: true });
      }
      const mobile = window.innerWidth < 900;
      if (mobile && $('ch-cartes') && !$('ch-cartes').hidden) {
        dessinerCartes(listeFiltree());
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

import('/sig-bambilor-demo/app/collab/pastilles.js').then((m) => { pastilleFn = m.pastilleHTML; }).catch(() => {});

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const h = window.location.hash || '';
    if (h === '#chantiers' || h.startsWith('#chantiers?')) {
      besoinRafraichissement = true;
      rafraichirNonLus();
    }
  });
  window.addEventListener('popstate', () => {
    const h = window.location.hash || '';
    if (h === '#chantiers' || h.startsWith('#chantiers?')) {
      besoinRafraichissement = true;
      rafraichirNonLus();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#ch-retour') || e.target.closest('[data-sousvue="lots"]')) {
      besoinRafraichissement = true;
      rafraichirNonLus();
    }
  });
}

export function conteneursListe() {
  if (!$('ch-cartes') || !$('ch-grille')) {
    etat.grille = null;
    $('ch-contenu').innerHTML = '<div id="ch-cartes" class="ch-cartes"></div><div id="ch-grille" class="ch-grille" hidden></div>';
  }
}

export function afficherListe() {
  $('ch-vue').value = 'liste';
  conteneursListe();
  if (besoinRafraichissement) {
    besoinRafraichissement = false;
    rafraichirNonLus();
  }
  $('ch-barre-filtres').hidden = false;
  $('ch-compteurs').hidden = false;
  $('ch-retour').hidden = true;
  $('ch-nouveau').hidden = !aRole('conducteur');
  $('ch-actions-fiche').hidden = true;

  const c = compteurs();
  $('ch-compte-en-cours').textContent = num(c.enCours);
  $('ch-compte-retard').textContent = num(c.retard);
  $('ch-compte-sans-visite').textContent = num(c.sansVisite);
  $('ch-compte-reserves').textContent = num(c.reserves);
  if ($('ch-compte-kfe')) $('ch-compte-kfe').textContent = num(c.kfeTotal);

  document.querySelectorAll('[data-compteur]').forEach((b) => b.classList.toggle('actif', b.dataset.compteur === etat.filtres.compteur));
  if ($('ch-filtre-contrat')) $('ch-filtre-contrat').value = etat.filtres.contrat || '';
  if ($('ch-filtre-commercial')) $('ch-filtre-commercial').value = etat.filtres.commercial || '';

  const liste = listeFiltree();
  $('ch-resultat').textContent = `${pl(liste.length, 'chantier', 'chantiers')}`;
  const mobile = window.innerWidth < 900;
  if (mobile) dessinerCartes(liste);
  else dessinerGrille(liste);
}

export function dessinerCartes(liste) {
  const html = liste.map((c) => {
    const etatL = cfg().etats_travaux[c.etat] || {};
    const kfe = etat.kfeMap.get(c.code_lot);
    const kfeBadge = kfe ? `<span class="badge-kfe" style="background:var(--accent);color:#fff">${esc(kfe.lot_contrat)}</span>` : '';
    const pastille = c.estime ? '<span class="ch-pastille estime">Estimé</span>' : '';
    const retard = c.retard_jours ? `<span class="ch-pastille retard">${num(c.retard_jours)} j de retard</span>` : '';
    const reserve = c.reserves_ouvertes ? `<span class="ch-pastille reserve">${num(c.reserves_ouvertes)} réserve${c.reserves_ouvertes > 1 ? 's' : ''}</span>` : '';
    const commSolde = kfe?.compte_solde ? '<span class="ch-pastille" style="background:color-mix(in srgb, var(--succes) 15%, var(--papier));color:var(--succes)">Soldé</span>' :
                      (kfe?.reliquat > 0 ? `<span class="ch-pastille" style="background:color-mix(in srgb, var(--alerte) 15%, var(--papier));color:var(--alerte)">Dû: ${esc(fcfa(kfe.reliquat))}</span>` : '');
    const av = kfe ? kfe.avancement_global : (c.avancement || 0);

    return `<a href="#chantiers/lot=${esc(encodeURIComponent(c.code_lot))}" class="ch-carte">
      <div class="ch-carte-tete">
        <strong>Lot ${esc(c.code_lot)}${pastilleHTML(nonLus[c.code_lot])}</strong>
        <div style="display:flex;gap:6px;align-items:center">
          ${kfeBadge}
          <span class="ch-phase" style="background:${esc(phaseCouleur(c.phase))}">${esc(c.phase)}</span>
        </div>
      </div>
      <div class="ch-carte-corps">
        <span>${esc(c.type_villa)} · ${esc(c.entreprise || '—')}</span>
        ${kfe?.acquereur_nom ? `<span class="aide">Acquéreur : <strong>${esc(kfe.acquereur_nom)}</strong></span>` : ''}
        <span class="ch-avancement">${pct(av / 100)} ${kfe ? '<small style="font-size:0.75rem;color:var(--gris)">(KFE)</small>' : ''}</span>
        <div class="jauge"><span style="width:${Math.min(100, av)}%;background:${esc(etatL.couleur || APP.jeton('--accent'))}"></span></div>
        <div class="ch-cartes-pastilles">${pastille}${retard}${reserve}${commSolde}</div>
      </div>
    </a>`;
  }).join('');
  $('ch-cartes').innerHTML = html || '<p class="vide">Aucun chantier ne correspond aux critères.</p>';
  $('ch-cartes').hidden = false;
  $('ch-grille').hidden = true;
}

export function dessinerGrille(liste) {
  $('ch-cartes').hidden = true;
  $('ch-cartes').innerHTML = '';
  $('ch-grille').hidden = false;
  const el = $('ch-grille');

  const colonnes = [
    {
      field: 'code_lot', headerName: 'Lot', width: 95,
      cellRenderer: (p) => {
        const a = document.createElement('a'); a.href = '#chantiers/lot=' + encodeURIComponent(p.value); a.textContent = p.value; a.style.fontWeight = '700';
        const pastille = pastilleHTML(nonLus[p.data?.code_lot || p.value]);
        if (pastille) a.insertAdjacentHTML('beforeend', pastille);
        return a;
      }
    },
    {
      headerName: 'Contrat', width: 105,
      valueGetter: (p) => etat.kfeMap.get(p.data.code_lot)?.lot_contrat || '—',
      cellRenderer: (p) => {
        if (!p.value || p.value === '—') return document.createTextNode('—');
        const s = document.createElement('span'); s.className = 'badge-kfe';
        s.style.cssText = 'background:var(--accent);color:#fff;font-size:0.6875rem;padding:2px 6px;border-radius:4px;font-weight:700;';
        s.textContent = p.value;
        return s;
      }
    },
    { field: 'phase', headerName: 'Phase', width: 85 },
    { field: 'type_villa', headerName: 'Type', width: 80 },
    { field: 'entreprise', headerName: 'Entreprise', width: 110 },
    {
      headerName: 'Avancement', width: 140,
      valueGetter: (p) => {
        const kfe = etat.kfeMap.get(p.data.code_lot);
        return kfe ? kfe.avancement_global : (p.data.avancement || 0);
      },
      cellRenderer: (p) => {
        const div = document.createElement('div'); div.className = 'ch-barre-cell';
        const val = p.value || 0;
        div.innerHTML = `<div class="jauge"><span style="width:${Math.min(100, val)}%"></span></div><span>${esc(pct(val / 100))}</span>`;
        return div;
      },
      comparator: (a, b) => (a || 0) - (b || 0),
    },
    {
      // Nom mis en forme (APP.noms) : prénoms avec majuscule initiale, noms en capitales ; la colonne
      // suivante trie par nom de famille.
      headerName: 'Acquéreur', flex: 1, minWidth: 140,
      valueGetter: (p) => APP.noms.nomPropre(etat.kfeMap.get(p.data.code_lot)?.acquereur_nom) || 'Non réservé',
      cellRenderer: (p) => {
        const val = p.value;
        if (val === 'Non réservé') {
          const span = document.createElement('span'); span.style.color = 'var(--gris)'; span.textContent = 'Non réservé'; return span;
        }
        const strong = document.createElement('strong'); strong.textContent = val; return strong;
      }
    },
    {
      headerName: 'Nom', width: 120, minWidth: 110,
      valueGetter: (p) => APP.noms.nomFamille(etat.kfeMap.get(p.data.code_lot)?.acquereur_nom),
      // Lots non réservés (sans nom) en fin de tri croissant.
      comparator: (a, b) => (!a || !b ? (a ? -1 : b ? 1 : 0) : APP.noms.comparer(a, b)),
    },
    {
      headerName: 'Solde Acquéreur', width: 130,
      valueGetter: (p) => etat.kfeMap.get(p.data.code_lot),
      cellRenderer: (p) => {
        const kfe = p.value;
        if (!kfe || !kfe.acquereur_nom) return document.createTextNode('—');
        const span = document.createElement('span');
        if (kfe.compte_solde) {
          span.style.cssText = 'color:var(--succes);font-weight:700;font-size:0.75rem;';
          span.textContent = 'Soldé (100%)';
        } else {
          span.style.cssText = 'color:var(--alerte);font-weight:700;font-size:0.75rem;';
          span.textContent = fcfa(kfe.reliquat);
        }
        return span;
      }
    },
    {
      field: 'retard_jours', headerName: 'Retard', width: 90,
      cellRenderer: (p) => {
        if (!p.value) return document.createTextNode('—');
        const s = document.createElement('span'); s.className = 'ch-retard'; s.textContent = num(p.value) + ' j'; return s;
      },
    },
    {
      field: 'reserves_ouvertes', headerName: 'Réserves', width: 90,
      cellRenderer: (p) => {
        if (!p.value) return document.createTextNode('—');
        const s = document.createElement('span'); s.className = 'ch-reserve'; s.textContent = num(p.value); return s;
      },
    },
    {
      field: 'derniere_visite', headerName: 'Dernière visite', width: 120,
      valueFormatter: (p) => dateFr(p.value) || '—',
    },
  ];

  const theme = agGrid.themeQuartz.withParams({
    fontSize: APP.taillePoliceGrille(),
    backgroundColor: APP.jeton('--papier'),
    foregroundColor: APP.jeton('--encre'),
    headerBackgroundColor: APP.jeton('--creux'),
    headerTextColor: APP.jeton('--encre'),
    borderColor: APP.jeton('--trait'),
    accentColor: APP.jeton('--accent'),
    fontFamily: APP.jeton('--corps'),
  });
  if (etat.grille) etat.grille.destroy();
  etat.grille = agGrid.createGrid(el, {
    columnDefs: colonnes,
    rowData: liste,
    theme,
    localeText: agGridLocaleFr(),
    defaultColDef: { sortable: true, filter: true, resizable: true },
    pagination: false,
    suppressCellFocus: true,
    onGridReady: (p) => { p.api.sizeColumnsToFit(); },
  });
}

function agGridLocaleFr() {
  return {
    searchOoo: 'Recherche…',
    noRowsToShow: 'Aucune ligne',
    loadingOoo: 'Chargement…',
    filterOoo: 'Filtrer…',
    equals: 'Égal à',
    notEqual: 'Différent de',
    contains: 'Contient',
    notContains: 'Ne contient pas',
    startsWith: 'Commence par',
    endsWith: 'Se termine par',
    blank: 'Vide',
    notBlank: 'Non vide',
  };
}

afficheurs.lots = afficherListe;
