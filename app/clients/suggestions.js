// Espace client : suggestions de saisie sous le champ de recherche de la liste.
import { etat, norm } from './commun.js';
import { ouvrirClient } from './fiche.js';
import { appliquerFiltres } from './liste.js';
const { $, esc } = APP;

// ---------- suggestions de saisie ----------
// Le champ de recherche filtre la liste à la frappe, mais ne dit jamais *quoi* taper. On propose donc
// sous le champ les clients et les lots qui correspondent — deux natures, deux effets : cliquer un
// client ouvre sa fiche, cliquer un lot ramène la liste à ce lot.
const SUGGESTIONS_MAX = 10;
export let suggestionsCourantes = [];

// Résumé des lots d'un client : la seconde ligne d'une suggestion de client.
function resumeLots(c) {
  const l = c.lots || [];
  if (!l.length) return c.nb_dossiers ? 'Dossier sans lot' : 'Sans dossier';
  return 'Lot' + (l.length > 1 ? 's ' : ' ') + l.slice(0, 3).join(', ')
    + (l.length > 3 ? ' +' + (l.length - 3) : '');
}

export function suggestionsSaisie(q) {
  const terme = norm(q);
  if (!etat.donnees || !etat.donnees.clients || terme.length < 2) return [];
  const clients = [], lots = [];
  for (const c of etat.donnees.clients) {
    if (clients.length >= SUGGESTIONS_MAX && lots.length >= SUGGESTIONS_MAX) break;
    // le nom lu sur les bordereaux (client qui a payé pour un proche) retrouve aussi le titulaire
    const payeur = (c.payeurs || []).find((p) => norm(p).includes(terme));
    if (clients.length < SUGGESTIONS_MAX && (norm(c.nom || '').includes(terme) || payeur)) {
      clients.push({ genre: 'client', ref: c.ref, libelle: c.nom || c.ref,
        detail: resumeLots(c) + (payeur && !norm(c.nom || '').includes(terme) ? ' · payé par ' + payeur : '') });
    }
    if (lots.length < SUGGESTIONS_MAX) {
      const trouve = (c.lots || []).find((l) => String(l).toLowerCase().includes(terme));
      // Libellé réduit au numéro : la pastille de gauche dit déjà « Lot », et « Lot 1451 »
      // affichait « Lot Lot 1451 ».
      if (trouve) lots.push({ genre: 'lot', lot: String(trouve), libelle: String(trouve), detail: c.nom || c.ref });
    }
  }
  // Les clients d'abord — c'est la recherche la plus fréquente — puis les lots, et on coupe court :
  // une liste de suggestions trop longue ne se lit plus.
  return clients.concat(lots).slice(0, SUGGESTIONS_MAX);
}

// Surligne le terme dans un libellé. La comparaison se fait en minuscules sur la chaîne d'origine :
// `norm()` décompose les accents, ce qui décalerait les positions.
function surlignerSuggestion(texte, terme) {
  const t = String(terme || '').toLowerCase();
  const i = texte.toLowerCase().indexOf(t);
  if (!t || i < 0) return esc(texte);
  return esc(texte.slice(0, i)) + '<mark>' + esc(texte.slice(i, i + t.length)) + '</mark>' + esc(texte.slice(i + t.length));
}

export function fermerSuggestions() {
  const zone = $('cl-suggestions');
  const champ = $('cl-q');
  if (zone) zone.hidden = true;
  if (champ) {
    champ.setAttribute('aria-expanded', 'false');
    champ.removeAttribute('aria-activedescendant');
  }
  suggestionsCourantes = [];
  etat.suggestionActive = -1;
}

export function majSuggestionActive() {
  const zone = $('cl-suggestions');
  const champ = $('cl-q');
  if (!zone) return;
  zone.querySelectorAll('.cl-suggestion').forEach((li, i) => {
    const on = i === etat.suggestionActive;
    li.classList.toggle('actif', on);
    li.setAttribute('aria-selected', String(on));
  });
  if (champ) {
    if (etat.suggestionActive >= 0) champ.setAttribute('aria-activedescendant', 'cl-sug-' + etat.suggestionActive);
    else champ.removeAttribute('aria-activedescendant');
  }
  const actif = zone.querySelector('.cl-suggestion.actif');
  if (actif) actif.scrollIntoView({ block: 'nearest' });
}

export function dessinerSuggestions(liste, terme) {
  const zone = $('cl-suggestions');
  const champ = $('cl-q');
  if (!zone || !champ) return;
  if (!liste.length) { fermerSuggestions(); return; }
  suggestionsCourantes = liste;
  etat.suggestionActive = -1;
  zone.innerHTML = liste.map((s, i) => `
    <li id="cl-sug-${i}" class="cl-suggestion" role="option" aria-selected="false" data-index="${i}">
      <span class="cl-suggestion-genre">${s.genre === 'lot' ? 'Lot' : 'Client'}</span>
      <span class="cl-suggestion-libelle">${surlignerSuggestion(s.libelle, terme)}</span>
      <span class="cl-suggestion-detail">${esc(s.detail)}</span>
    </li>`).join('');
  zone.hidden = false;
  champ.setAttribute('aria-expanded', 'true');
}

export function choisirSuggestion(i) {
  const s = suggestionsCourantes[i];
  if (!s) return;
  fermerSuggestions();
  if (s.genre === 'lot') {
    // Un lot : on remplit le champ et on laisse le filtre faire son travail — la recherche couvre
    // déjà les numéros de lot — ce qui restreint la liste sans changer d'écran.
    $('cl-q').value = s.lot;
    appliquerFiltres();
    return;
  }
  ouvrirClient(s.ref);
}
