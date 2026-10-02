// Espace client : constantes, libellés, utilitaires et état partagé entre les modules de la page.
const fcfa = SIG.fmtFCFA;

// État partagé : les valeurs réassignées depuis plusieurs modules (une liaison importée est en
// lecture seule). Le reste de l'état vit dans le module qui l'écrit.
export const etat = {
  donnees: null,          // réponse de /api/clients/
  grille: null,           // instance AG Grid de la liste : créée une fois, redessinée ensuite (le tri est un état)
  roleVue: null,          // poste choisi dans la fiche (sinon déduit des rôles du compte)
  rapportApercuUrl: null, // URL blob de l'aperçu du rapport d'état
  suggestionActive: -1,   // suggestion de saisie surlignée au clavier
};

export const PIECES = {
  contrat: 'Contrat', signature: 'Signatures', identite: 'Pièce d’identité', bordereau: 'Bordereau de versement',
  attestation: 'Attestation', avenant: 'Avenant', cession: 'Cession', recu: 'Reçu / quittance', banque: 'Pièce bancaire',
  courrier: 'Courrier', echeancier: 'Échéancier', pv: 'Procès-verbal', juridique: 'Pièce juridique', autre: 'Autre page', vide: 'Page vide',
};

export const CHAMPS = {
  nom: 'Nom (contrat)', date_naissance: 'Date de naissance', lieu_naissance: 'Lieu de naissance',
  nationalite: 'Nationalité', piece_identite: 'Pièce d’identité', profession: 'Profession', adresse: 'Adresse',
  telephone: 'Téléphone', email: 'E-mail', date_contrat: 'Date du contrat', lot: 'Lot (contrat / bordereau)',
  lot_initial: 'Lot initial', lot_avenant: 'Lot réaffecté (avenant)', date_avenant: "Date de l'avenant",
  type_villa: 'Type (contrat / bordereau)', superficie: 'Superficie (contrat / bordereau)', prix: 'Prix (bordereau)',
};

export const FORMATS = {
  date_naissance: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? dateFr(v) : v),
  date_contrat: (v) => dateFr(v),
  date_avenant: (v) => dateFr(v),
  prix: (v) => fcfa(Number(v)),
  superficie: (v) => SIG.fmtNum(Number(v)) + ' m²',
};

export const estFrais = (v) => /frais/i.test(v.nature || '');

// Actes lus dans un dossier scanné (etl/import_dossiers_ocr.py, lire_actes), affichés dans l'ordre du temps
export const ACTES = {
  avenant: 'Avenant (changement de lot)', cession: 'Cession', substitution: 'Substitution', transfert: 'Transfert de nom',
  changement_nom: 'Changement de nom', procuration: 'Procuration', protocole: 'Protocole d’accord', desistement: 'Désistement',
  attestation_possession: 'Attestation de prise de possession', attestation_solde: 'Attestation de solde', succession: 'Succession',
  attestation: 'Attestation', mise_en_demeure: 'Mise en demeure', resiliation: 'Résiliation', decharge: 'Décharge / quitus',
  proces_verbal: 'Procès-verbal', certificat: 'Certificat', reconnaissance_dette: 'Reconnaissance de dette',
  promesse_vente: 'Promesse de vente', declaration: 'Déclaration',
};

export const ALERTES = {
  PRIX_DIFFERENT: 'Le prix de vente lu sur les bordereaux diffère du fichier commercial.',
  VERSE_DIFFERENT: 'Le total des bordereaux lus (hors frais de dossier) diffère du total versé du fichier commercial.',
  LOT_DIFFERENT: 'Le lot cité sur les pièces diffère du lot affecté dans le dossier.',
  NOM_DIFFERENT: 'Le nom lu dans le dossier scanné (contrat, avenant de cession ou bordereau) ne correspond pas à l’acquéreur.',
  CESSION_LOT_DIFFERENT: 'Un avenant cède une villa dont le lot n’est pas celui du client dans le fichier commercial.',
  CESSION_NON_CONCORDANTE: 'Un avenant cède la villa à un autre client que celui du fichier commercial : la cession n’y est pas reportée.',
  NOM_DOCUMENT_DIFFERENT: 'Le titulaire lu dans le dossier scanné (bénéficiaire du dernier acte, sinon contrat ou bordereaux) n’est pas le client affecté : scan rangé chez le mauvais client ou changement de titulaire non reporté.',
  AVENANT_NON_PRIS_EN_COMPTE: 'Un avenant de réaffectation de lot a été détecté dans le scan mais n’est pas encore reporté sur le dossier commercial.',
  SANS_CONTRAT: 'Aucune page de contrat reconnue dans le dossier scanné.',
  SANS_BORDEREAU: 'Aucun bordereau de versement reconnu dans le dossier scanné.',
  OCR_INCOMPLET: 'Toutes les pages du PDF n’ont pas encore été lues.',
};

export const dateFr = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

export function moisFr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export function initiales(nom) {
  if (!nom) return 'CL';
  const clean = String(nom).trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (!clean.length) return 'CL';
  if (clean.length === 1) return clean[0].slice(0, 2).toUpperCase();
  return (clean[0][0] + clean[1][0]).toUpperCase();
}

export const filtres = {
  dossier: new Set(),
  livraison: new Set(),
  phase: new Set(),
  compte: new Set(),
  vigilance: new Set(),
  ged: new Set(),
  ongletFiche: 'dossiers', // 'dossiers', 'remboursements', 'ged', 'donnees', 'profil'
};

export const LABELS_FILTRES = {
  dossier: {
    'avec-dossier': 'Avec dossier', 'sans-dossier': 'Sans dossier (en attente)', 'sans-lot': 'Dossier sans lot',
    'plusieurs-lots': 'Plusieurs lots', 'plusieurs-contrats': 'Plusieurs contrats', 'sans-contrat': 'Contrat manquant', 'contrat-bloque': 'Sans contrat, versement < 30 %',
    desiste: 'Désisté',
  },
  livraison: { livree: 'Livré', 'sous-reserve': 'Livré sous réserve', 'non-livree': 'Non livré', 'sans-pv': 'Livré sans PV' },
  phase: { PH1: 'Phase 1', PH2: 'Phase 2', PH3: 'Phase 3', PH4: 'Phase 4', 'sans-lot': 'Sans lot' },
  compte: { solde: 'Compte soldé (100%)', impaye: 'Reliquat dû' },
  vigilance: { remboursement: 'Désistement / Remb.', contentieux: 'Contentieux', alertes: 'Écarts OCR' },
  ged: { scanne: 'Dossier scanné', 'sans-doc': 'Non scanné', 'non-rattaches': 'Docs orphelins' },
};

// Les six groupes de filtres, dans l'ordre d'affichage. Servent au compteur, aux pilules et
// au compteur de la case d'indicateur.
export const GROUPES_FILTRES = ['dossier', 'livraison', 'phase', 'compte', 'vigilance', 'ged'];

// Raccourcis de l'en-tête : la case d'indicateur, le groupe et la valeur qu'elle pose.
export const KPI_GROUPES = [
  ['.cl-kpi-succes', 'compte', 'solde'],
  ['.cl-kpi-impayes', 'compte', 'impaye'],
  ['.cl-kpi-orange', 'dossier', 'sans-dossier'],
  ['.cl-kpi-remb', 'vigilance', 'remboursement'],
  ['.cl-kpi-contentieux', 'vigilance', 'contentieux'],
];

// dans l'application, et des numéros qui se suivent (4 < 8 < 342 < 1281 BIS).

// Naturel : « 4, 8, 342, 1281 BIS » et non l'ordre texte « 1281, 1997, 4 ». Valeurs absentes en fin de liste.
export const comparerNaturel = (a, b) => {
  const va = String(a ?? '').trim();
  const vb = String(b ?? '').trim();
  if (!va || !vb) return va === vb ? 0 : (va ? -1 : 1);
  return va.localeCompare(vb, 'fr', { numeric: true });
};
// Texte : insensible à la casse et aux accents (NDIAYE = Ndiaye), les nombres restant ordonnés.
export const comparerTexte = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'fr', { numeric: true, sensitivity: 'base' });
// Listes (lots, phases, statuts) : terme à terme, puis la plus courte d'abord. Une liste vide passe en fin
// de tri croissant — même règle que pour une valeur absente, et même choix que le « NULLS LAST » de l'API.
export const comparerListe = (a, b) => {
  const A = [...(a || [])].sort(comparerNaturel);
  const B = [...(b || [])].sort(comparerNaturel);
  if (!A.length || !B.length) return A.length === B.length ? 0 : (A.length ? -1 : 1);
  for (let i = 0; i < Math.min(A.length, B.length); i += 1) {
    const r = comparerNaturel(A[i], B[i]);
    if (r) return r;
  }
  return A.length - B.length;
};

// Codes d'anomalie produits par l'import commercial (etl/import_commercial.py) : la base stocke le code,
// les libellés ne servent qu'à l'infobulle.
export const ANOMALIES = {
  VERSEMENT_INCOMPLET: 'Versements incomplets', MANQUE_BORDEREAU: 'Bordereau manquant',
  CONTRAT_INTROUVABLE: 'Contrat introuvable', CONTRAT_NON_SIGNE: 'Contrat non signé',
  DOSSIER_INCOMPLET: 'Dossier incomplet', DOSSIER_NON_TROUVE: 'Dossier non trouvé',
  DOUBLE_ATTRIBUTION: 'Double attribution', MENTION_ANNULE: 'Mention « annulé »',
  TROP_PERCU: 'Trop-perçu', A_RECOUVRER: 'À recouvrer', CESSION: 'Cession',
  LIGNE_DUPLIQUEE: 'Ligne dupliquée', RELIQUAT_INCOHERENT: 'Reliquat incohérent',
  HOMONYME_SEPARE: 'Homonyme séparé', HOMONYME_A_VERIFIER: 'Homonyme à vérifier', HOMONYME_POSSIBLE: 'Homonyme possible',
  LOT_PARTAGE: 'Lot partagé', LOT_ABSENT: 'Lot absent',
};

// Deux personnes de même nom ne partagent plus une fiche (etl/homonymes.yml). Le fichier Excel fait foi pour
// l'attribution des lots ; le scan n'est qu'un appoint. Textes affichés en tête de fiche.
export const NOTES_AFFECTATION = {
  HOMONYME_SEPARE: 'Un autre client porte le même nom. Les deux fiches sont séparées : CNI, dates de naissance et coordonnées diffèrent. Ne pas les confondre.',
  HOMONYME_A_VERIFIER: 'Un autre client porte le même nom. Séparé selon le fichier Excel (téléphone, adresse, dates de réservation), sans scan pour confirmer : à vérifier.',
  HOMONYME_POSSIBLE: 'Possible homonyme, non séparé : les lots ont des dates ou des adresses différentes, ou un scan est au nom d’une autre personne. Attribution des lots conservée selon le fichier Excel ; à trancher par le métier.',
  LOT_PARTAGE: 'Le fichier Excel attribue le même lot à un autre acquéreur actif. Aucun des deux n’est écarté : à arbitrer par le métier (voir docs/AFFECTATIONS.md).',
  LOT_ABSENT: 'Le fichier Excel ne donne aucun lot à ce client. Le nom de ses PDF peut évoquer un lot, mais l’Excel prime : lot à renseigner par le métier.',
};

// Situation d'un client : le liseré de la ligne, la pastille d'avatar et le libellé de statut en
// dérivent tous les trois, pour qu'une même ligne ne puisse pas dire deux choses différentes.
export const SITUATIONS = {
  'sans-dossier': { classe: 'tr-sans-dossier', libelle: 'En attente', badge: 'doux' },
  desiste: { classe: 'tr-desiste', libelle: 'Désisté', badge: 'alerte' },
  contentieux: { classe: 'tr-contentieux', libelle: 'Contentieux', badge: 'alerte' },
  remb: { classe: 'tr-remb', libelle: 'Remboursement', badge: 'cl-badge-remb' },
  solde: { classe: 'tr-solde', libelle: 'Soldé', badge: 'cl-badge-succes' },
  encours: { classe: 'tr-encours', libelle: 'En cours', badge: 'doux' },
};

export function situation(c) {
  if (!c.nb_dossiers) return 'sans-dossier';
  // désisté : tous ses dossiers sont clos par désistement (rouge, comme le contentieux et le remboursement)
  if (c.nb_desistes > 0 && c.nb_desistes >= c.nb_dossiers) return 'desiste';
  if (c.contentieux) return 'contentieux';
  if (c.a_remboursement) return 'remb';
  const prix = c.prix_vente || 0;
  if (prix > 0 && ((c.reliquat || 0) <= 0 || (c.total_verse || 0) >= prix)) return 'solde';
  return 'encours';
}

export const tauxPaye = (c) => {
  const prix = c.prix_vente || 0;
  const verse = c.total_verse || 0;
  return prix > 0 ? Math.min(100, Math.round((verse / prix) * 100)) : (verse > 0 ? 100 : 0);
};

// Création d'un nœud : les rendus de cellules manipulent le DOM (pas de chaîne HTML) pour que les noms
// d'acquéreurs ne puissent jamais être interprétés comme du balisage.
export function el(balise, classe, texte) {
  const n = document.createElement(balise);
  if (classe) n.className = classe;
  if (texte != null) n.textContent = texte;
  return n;
}
