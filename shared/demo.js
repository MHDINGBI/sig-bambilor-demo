// Instantané technique réel, clients et montants commerciaux inventés. Sans API ni jetons.
(function () {
  const terrain = window.SIG_TERRAIN;
  if (!terrain) throw new Error('Instantané technique absent : reconstruire la démo.');
  const cfg = terrain.config;
  const features = terrain.layers.parcelles.features.map((f, i) => {
    const vendu = i % 3 === 0, reserve = i % 3 === 1;
    const prix = vendu || reserve ? 20000000 + (i % 3) * 5000000 : 0;
    const verse = vendu ? prix : reserve ? prix * .4 : 0;
    return { ...f, id: f.properties.code_lot, properties: { ...f.properties,
      statut_commercial: vendu ? 'vendu' : reserve ? 'reserve' : 'disponible',
      prix_vente: prix, total_verse: verse, reliquat: prix - verse, nb_dossiers_actifs: prix ? 1 : 0,
      observations: 'Plan et travaux réels. Identités et données commerciales fictives.'
    } };
  });
  const clients = features.filter(f => f.properties.prix_vente).map((f, i) => {
    const p = f.properties, ref = 'CLIENT-DEMO-' + String(i + 1).padStart(3, '0');
    const nom = 'Client démo ' + String(i + 1).padStart(3, '0');
    p.acquereur_ref = ref; p.acquereur_nom = nom;
    return { ref, nom, nom_famille: '', lots: [p.code_lot], phases: [p.code_phase],
      prix_vente: p.prix_vente, total_verse: p.total_verse, reliquat: p.reliquat,
      nb_dossiers: 1, nb_contrats: 1, nb_documents: 0, nb_alertes: 0, nb_sans_contrat: 0,
      nb_livres: p.etat_travaux === 'LIVREE' ? 1 : 0, nb_non_livres: p.etat_travaux === 'LIVREE' ? 0 : 1,
      nb_desistes: 0, numeros_dossiers: ['DOSSIER-DEMO-' + (i + 1)], payeurs: [],
      a_remboursement: false, contentieux: false };
  });
  const chantiers = features.filter(f => f.properties.etat_travaux).map(f => {
    const p = f.properties;
    return { code_lot: p.code_lot, phase: p.code_phase, type_villa: p.type_villa,
      entreprise: 'Non renseignée', conducteur: 'Masqué', avancement: p.taux_execution * 100,
      etat: p.etat_travaux, devis_ttc: p.devis_ttc, cout_realisation_ttc: p.cout_realisation_ttc,
      fin_prevue: null, retard_jours: 0, reserves_ouvertes: 0, derniere_visite: null, estime: true };
  });
  const corps = ['gros_oeuvre', 'etancheite', 'carrelage', 'menuiserie', 'plomberie', 'electricite', 'peinture'];
  terrain.kfe.forEach(k => {
    const p = features.find(f => f.properties.code_lot === k.code_lot)?.properties;
    if (!p) return;
    Object.assign(p, { kfe_lot_contrat: k.lot_contrat, kfe_avancement: k.avancement_global,
      kfe_budget: k.budget_finition, kfe_montant: k.montant_execute });
    corps.forEach(c => { p['kfe_' + c] = k[c + '_pct']; });
  });
  const kfe = terrain.kfe.map(k => {
    const p = features.find(f => f.properties.code_lot === k.code_lot)?.properties || {};
    return { ...k, phase: k.code_phase, budget_total: k.budget_finition,
      acquereur_nom: p.acquereur_nom || null, acquereur_ref: p.acquereur_ref || null,
      prix_vente: p.prix_vente || 0, total_verse: p.total_verse || 0, reliquat: p.reliquat || 0,
      nb_dossiers: p.nb_dossiers_actifs || 0, compte_solde: p.prix_vente > 0 && p.reliquat === 0,
      reserves: [], visites: [], photos: [] };
  });
  const sum = key => kfe.reduce((s, x) => s + Number(x[key] || 0), 0);
  const stats = { global: { total_villas: kfe.length, avancement_moyen: sum('avancement_global') / kfe.length,
    budget_total: sum('budget_total'), montant_execute: sum('montant_execute'), villas_achevees: kfe.filter(x => x.avancement_global === 100).length,
    villas_en_cours: kfe.filter(x => x.avancement_global < 100).length, villas_non_demarrees: 0 },
    corps_etat: Object.fromEntries(corps.map(c => [c, { pct: sum(c + '_pct') / kfe.length, budget: sum(c + '_budget'), montant: sum(c + '_montant') }])) };
  const seed = { travaux: { date_situation: features.map(f => f.properties.date_situation).filter(Boolean).sort().at(-1) }, calcule_le: '2026-10-01T10:00:00Z' };
  async function api(path, options = {}) {
    if (options.method && options.method.toUpperCase() !== 'GET') throw new Error('Démonstration en lecture seule.');
    const route = path.split('?')[0];
    if (route === '/api/me/') return { username: 'Visiteur démo', role: 'visiteur', roles: ['visiteur'], modules: [{ vues: ['synthese', 'carte', 'chantiers', 'clients'] }] };
    if (route === '/api/clients/') return { clients, documents_non_rattaches: [] };
    const client = route.match(/^\/api\/clients\/([^/]+)\/$/);
    if (client) {
      const c = clients.find(c => c.ref === decodeURIComponent(client[1]));
      if (c) {
        const p = features.find(f => f.properties.acquereur_ref === c.ref).properties;
        return { ...c, lots: [p], acquereur: { nom_complet: c.nom }, documents: [], remboursements: [], desistements: [],
          dossiers: [{ ...p, id: clients.indexOf(c) + 1, numero_dossier: c.numeros_dossiers[0], statut_dossier: 'actif', anomalies: [], versements: [] }] };
      }
    }
    if (route === '/api/journal/') return [];
    if (route === '/api/chantiers/') return chantiers;
    if (route === '/api/chantiers/kfe/') {
      const lot = new URLSearchParams(path.split('?')[1] || '').get('lot');
      return lot ? kfe.filter(x => x.code_lot === lot) : kfe;
    }
    if (route === '/api/chantiers/kfe/stats/') return stats;
    if (route === '/api/chantiers/rapports-journaliers/') return [];
    const chantier = route.match(/^\/api\/chantiers\/(?:kfe\/)?([^/]+)\/$/);
    if (chantier) {
      const c = chantiers.find(c => c.code_lot === chantier[1]);
      if (c) return { ...c, lot: features.find(f => f.id === c.code_lot), kfe: kfe.find(k => k.code_lot === c.code_lot), etapes: [], visites: [], reserves: [], photos: [] };
    }
    if (route === '/api/config/') return cfg;
    if (route === '/api/kpi/') {
      APP.cfg = cfg;
      return APP.vues.synthese.kpiDepuisParcelles(features, seed);
    }
    if (route === '/api/layers/parcelles/') return { type: 'FeatureCollection', features };
    if (/^\/api\/layers\/(zones_phase|voirie|equipements|batiments|reseaux)\/$/.test(route)) return terrain.layers[route.split('/')[3]] || { type: 'FeatureCollection', features: [] };
    const lot = route.match(/^\/api\/lots\/([^/]+)\/$/);
    if (lot) {
      const f = features.find(f => f.id === decodeURIComponent(lot[1]));
      if (f) return { lot: f, travaux: [], dossiers: [], documents: [], remboursements: [], historique: [] };
    }
    throw new Error('Fonction indisponible dans cette démonstration.');
  }
  Object.assign(SIG, { DEV: true, DEMO: true, api, me: () => api('/api/me/'), config: () => api('/api/config/'),
    logout: () => { location.href = '/sig-bambilor-demo/'; }, login: async () => { throw new Error('Aucun compte dans la démonstration.'); }, jetons: () => {} });
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('badge-demo').textContent = 'Plan et travaux réels · Clients fictifs · Lecture seule';
    document.getElementById('deconnexion').hidden = true;
  });
})();
