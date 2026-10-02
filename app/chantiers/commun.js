// Chantiers — état partagé et helpers communs (audit 23/09, R09 : découpage du front).
// Toutes les sous-vues (cockpit, dashboard, terrain, lots, rapports, import, detail)
// importent ce module ; les données, filtres et sous-vue courants vivent ici.
const { $, esc, num, pct, pl } = APP;

// ---------- constantes ----------
export const GRV = {
  mineure: { libelle: 'Mineure', classe: 'mineure' },
  majeure: { libelle: 'Majeure', classe: 'majeure' },
  bloquante: { libelle: 'Bloquante', classe: 'bloquante' },
};
export const ETAPE_QUICK = [0, 50, 100];
export const MAX_IMAGE = 1600;
export const QUALITE_JPEG = 0.8;

export const CORPS_ETAT_KFE = [
  { id: 'gros_oeuvre', nom: '1. Gros œuvre', icone: '🧱' },
  { id: 'etancheite', nom: '2. Étanchéité', icone: '💧' },
  { id: 'carrelage', nom: '3. Carrelage', icone: '🪨' },
  { id: 'menuiserie', nom: '4. Menuiserie', icone: '🪟' },
  { id: 'plomberie', nom: '5. Plomberie', icone: '🚿' },
  { id: 'electricite', nom: '6. Électricité', icone: '⚡' },
  { id: 'peinture', nom: '7. Peinture', icone: '🎨' },
];

// ---------- état mutable ----------
export const etat = {
  sousVue: 'lots', // 'cockpit', 'dashboard', 'terrain', 'lots', 'rapports', 'import'
  donnees: [], kfeDonnees: [], kfeMap: new Map(),
  statsKfe: null,
  rapportsListe: [], rapportActif: null,
  detail: null, grille: null, graph: null,
  miniCarte: null, tranchePointee: null,
  filtres: { q: '', phase: '', entreprise: '', etat: '', compteur: '', commercial: '', contrat: '' },
  photosVisite: [],
  // Mode Terrain
  lotTerrainActif: null, lotTerrainData: null, corpsModifiesTerrain: {},
  photosTerrain: [], tagPhotoActif: 'Gros œuvre',
  audioReconnaissance: null, audioEnCours: false,
};

// ---------- helpers purs ----------
export const cfg = () => APP.cfg;
export const aRole = (...r) => APP.aRole(...r);
export const fcfa = (v) => (v != null && !isNaN(v) ? SIG.fmtFCFA(v) : '—');
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export const dateFr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
export const debutJour = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso) : null);
export const joursDepuis = (iso) => {
  const d = debutJour(iso);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

export function uniq(liste, cle) {
  const vus = new Set();
  return liste.filter((x) => {
    const v = x[cle];
    if (vus.has(v)) return false;
    vus.add(v);
    return true;
  });
}

export function phaseCouleur(code) {
  const ph = (cfg().phases || []).find((p) => p.code === code);
  return ph?.couleur || APP.jeton(`--${(code || '').toLowerCase()}`) || APP.jeton('--gris');
}

// ---------- règles métier ----------
export function estEnRetard(c) { return (c.retard_jours || 0) > 0; }
export function sansVisite(c) {
  const max = cfg().decisions?.visite_max_jours || 14;
  if (!c.derniere_visite) return true;
  return joursDepuis(c.derniere_visite) > max;
}
export function aReserves(c) { return (c.reserves_ouvertes || 0) > 0; }
export function estEnDepassement(c) {
  if (!c.devis_ttc || !c.cout_realisation_ttc) return false;
  const maxPct = (cfg().decisions?.depassement_devis_pct || 10) / 100;
  return c.cout_realisation_ttc > c.devis_ttc * (1 + maxPct);
}

export function compteurs() {
  const enCours = etat.donnees.filter((c) => c.etat !== 'LIVREE').length;
  const retard = etat.donnees.filter(estEnRetard).length;
  const sansVisiteN = etat.donnees.filter(sansVisite).length;
  const reserves = etat.donnees.filter(aReserves).length;
  const depassement = etat.donnees.filter(estEnDepassement).length;
  const kfeTotal = etat.kfeDonnees.length;
  return { enCours, retard, sansVisite: sansVisiteN, reserves, depassement, kfeTotal };
}

// Croisement chantier × commercial (Piste E) : une seule règle pour la liste et le tableau de bord
export const MATRICE = [
  { cle: 'prets_remise', titre: 'Livrables prêts', aide: 'chantier ≥ 90 % et compte soldé' },
  { cle: 'alerte_recouvrement', titre: 'Alerte recouvrement', aide: 'chantier ≥ 75 % et reliquat impayé' },
  { cle: 'priorite_chantier', titre: 'Priorité chantier', aide: 'compte soldé mais chantier < 70 %' },
  { cle: 'disponibles', titre: 'Stock disponible', aide: 'sans acquéreur, chantier ≥ 50 %' },
];
export function dansMatrice(kfe, cle) {
  const av = kfe.avancement_global || 0;
  const solde = Boolean(kfe.compte_solde);
  const reliquat = Number(kfe.reliquat || 0);
  const nbDossiers = Number(kfe.nb_dossiers || 0);
  if (cle === 'prets_remise') return av >= 90 && solde;
  if (cle === 'alerte_recouvrement') return av >= 75 && reliquat > 0;
  if (cle === 'priorite_chantier') return solde && av < 70;
  if (cle === 'disponibles') return nbDossiers === 0 && av >= 50;
  return true;
}

export function listeFiltree() {
  const q = norm(etat.filtres.q);
  const { filtres, kfeMap } = etat;
  return etat.donnees.filter((c) => {
    const kfe = kfeMap.get(c.code_lot);
    if (q && !norm(c.code_lot).includes(q) && !(kfe?.acquereur_nom && norm(kfe.acquereur_nom).includes(q))) return false;
    if (filtres.phase && c.phase !== filtres.phase) return false;
    if (filtres.entreprise && c.entreprise !== filtres.entreprise) return false;
    if (filtres.etat && c.etat !== filtres.etat) return false;
    if (filtres.contrat && kfe?.lot_contrat !== filtres.contrat) return false;
    if (filtres.commercial && (!kfe || !dansMatrice(kfe, filtres.commercial))) return false;
    if (filtres.compteur === 'retard' && !estEnRetard(c)) return false;
    if (filtres.compteur === 'sans_visite' && !sansVisite(c)) return false;
    if (filtres.compteur === 'reserves' && !aReserves(c)) return false;
    if (filtres.compteur === 'depassement' && !estEnDepassement(c)) return false;
    if (filtres.compteur === 'en_cours' && c.etat === 'LIVREE') return false;
    if (filtres.compteur === 'kfe' && !kfe) return false;
    return true;
  });
}

// ---------- chargement ----------
export async function charger() {
  try {
    const [resChantiers, resKfe, resStats] = await Promise.all([
      SIG.api('/api/chantiers/'),
      SIG.api('/api/chantiers/kfe/').catch(() => []),
      SIG.api('/api/chantiers/kfe/stats/').catch(() => null),
    ]);
    etat.donnees = Array.isArray(resChantiers) ? resChantiers : (resChantiers?.results || []);
    etat.kfeDonnees = Array.isArray(resKfe) ? resKfe : (resKfe?.results || []);
    etat.statsKfe = resStats;
    etat.kfeMap = new Map();
    etat.kfeDonnees.forEach((k) => etat.kfeMap.set(k.code_lot, k));
    remplirFiltres();
    appliquerQs();
  } catch (e) {
    etat.donnees = [];
    etat.kfeDonnees = [];
    etat.statsKfe = null;
    console.error('Erreur chargement chantiers', e);
  }
}

export function remplirFiltres() {
  const phases = uniq(etat.donnees, 'phase').map((c) => c.phase).filter(Boolean).sort();
  const entreprises = uniq(etat.donnees, 'entreprise').map((c) => c.entreprise).filter(Boolean).sort();
  const etats = Object.keys(cfg().etats_travaux || {});

  const sel = (id, options, vide) => {
    const el = $(id);
    if (!el) return;
    const v = el.value;
    el.innerHTML = `<option value="">${esc(vide)}</option>` + options.map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
    el.value = options.some((o) => o.v === v) ? v : '';
  };

  sel('ch-phase', phases.map((p) => ({ v: p, l: (cfg().phases.find((x) => x.code === p)?.nom) || p })), 'Toutes les phases');
  sel('ch-entreprise', entreprises.map((e) => ({ v: e, l: e })), 'Toutes les entreprises');
  sel('ch-etat', etats.map((e) => ({ v: e, l: cfg().etats_travaux[e].libelle })), 'Tous les états');
}

export function appliquerQs() {
  const r = lireHash();
  if (r.qs) {
    const p = new URLSearchParams(r.qs);
    const f = p.get('filtre');
    if (['en_cours', 'retard', 'sans_visite', 'reserves', 'kfe', 'depassement'].includes(f)) {
      etat.filtres.compteur = f;
      etat.sousVue = 'lots';
    }
    const sv = p.get('sousvue') || p.get('vue');
    if (['cockpit', 'dashboard', 'terrain', 'lots', 'rapports', 'import'].includes(sv)) etat.sousVue = sv;
    const comm = p.get('commercial');
    if (['prets_remise', 'alerte_recouvrement', 'priorite_chantier', 'disponibles'].includes(comm)) {
      etat.filtres.commercial = comm;
      etat.sousVue = 'lots';
    }
  }
}

export function lireHash() {
  const h = location.hash.slice(1);
  const i = h.indexOf('?');
  const chemin = i < 0 ? h : h.slice(0, i);
  const [vue, extra] = chemin.split('/');
  const m = extra && extra.match(/^lot=(.*)$/);
  return { vue, lot: m ? decodeURIComponent(m[1]) : null, qs: i < 0 ? null : h.slice(i + 1) };
}

export const nav = (hash) => { location.hash = hash; };

export const trancheKfe = (v) => {
  const T = APP.tranchesKfe;
  return T.find((t) => Number(v) <= t.max) || T[T.length - 1];
};
// Lien vers la grande carte, sur la thématique KFE ; `codes` : lots à surligner ensemble (facultatif)
export const lienCarteKfe = (codes) => '#carte' + (codes && codes.length ? '/lots=' + encodeURIComponent(codes.join(',')) : '') + '?theme=kfe_160';

// ---------- photos : redimensionnement partagé ----------
export function redimensionner(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ratio = Math.min(MAX_IMAGE / width, MAX_IMAGE / height, 1);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('conversion impossible')); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', QUALITE_JPEG);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

// ---------- dictée vocale (Web Speech API) ----------
export function demarrerDictation(targetInputId, btnElement) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    APP.ui.toast("La dictée vocale n'est pas supportée par ce navigateur (utilisez Google Chrome sur Android ou Safari sur iPhone).", { type: 'erreur' });
    return;
  }
  if (etat.audioEnCours) {
    if (etat.audioReconnaissance) etat.audioReconnaissance.stop();
    arreterDictation(btnElement);
    return;
  }
  try {
    const rec = new SpeechRec();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = false;
    etat.audioReconnaissance = rec;
    etat.audioEnCours = true;
    if (btnElement) {
      btnElement.classList.add('ecoute');
      btnElement.dataset.origText = btnElement.textContent;
      btnElement.textContent = '🔴 Parlez maintenant...';
    }
    rec.onresult = (e) => {
      const texte = e.results[0][0].transcript;
      const el = $(targetInputId);
      if (el) {
        el.value = (el.value ? el.value + ' ' : '') + texte;
        el.dispatchEvent(new Event('input'));
      }
    };
    rec.onerror = (e) => {
      console.warn('Erreur dictée vocale', e);
      arreterDictation(btnElement);
    };
    rec.onend = () => {
      arreterDictation(btnElement);
    };
    rec.start();
  } catch (err) {
    console.error(err);
    arreterDictation(btnElement);
  }
}

export function arreterDictation(btnElement) {
  etat.audioEnCours = false;
  if (btnElement) {
    btnElement.classList.remove('ecoute');
    btnElement.textContent = btnElement.dataset.origText || '🎙️ Dicter';
  }
}

// ---------- registre des sous-vues ----------
// Le routeur (chantiers.js) enregistre ici chaque afficheur ; les modules
// s'appellent entre eux via changerSousVue sans créer de cycles d'imports.
export const afficheurs = {};
export function changerSousVue(nouvelle) { if (!['lots', 'dashboard'].includes(nouvelle)) nouvelle = 'lots';
  APP.collab?.fermer();
  etat.sousVue = nouvelle;
  if (etat.miniCarte) { etat.miniCarte.remove(); etat.miniCarte = null; }
  document.querySelectorAll('.ch-sousonglet').forEach((btn) => {
    btn.classList.toggle('actif', btn.dataset.sousvue === etat.sousVue);
  });
  $('ch-actions-fiche').hidden = true;
  $('ch-retour').hidden = true;
  $('ch-barre-filtres').hidden = etat.sousVue !== 'lots';
  $('ch-compteurs').hidden = etat.sousVue !== 'lots';
  afficheurs[etat.sousVue]?.();
}
