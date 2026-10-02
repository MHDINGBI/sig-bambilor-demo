// Client API commun (contrat : docs/CONTEXTE-WORKERS.md). Figé — ne pas modifier sans le chef d'orchestre.
(function () {
  const DEV = new URLSearchParams(location.search).has('dev');
  const K = { access: 'sig.access', refresh: 'sig.refresh' };
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const DEV_MAP = {
    '/api/layers/parcelles/': '/dev-data/parcelles.geojson',
    '/api/kpi/': '/dev-data/kpi.json',
    '/api/config/': '/dev-data/config.json',
    // V2 : jeux fictifs conformes au contrat (docs/PLAN-V2-PLATEFORME.md §5), sans aucune donnée réelle
    '/api/chantiers/': '/dev-data/chantiers.json',
    '/api/dossiers/': '/dev-data/dossiers.json',
    '/api/pilotage/': '/dev-data/pilotage.json',
    '/api/decisions/': '/dev-data/decisions.json',
    // Cockpit KFE : instantané anonymisé de la base locale (noms remplacés, R17 de l'audit du 23/09)
    '/api/chantiers/kfe/': '/dev-data/kfe.json',
    '/api/chantiers/kfe/stats/': '/dev-data/kfe-stats.json',
  };

  // Le jeton de renouvellement tourne (usage unique côté serveur) : deux renouvellements simultanés avec le même
  // jeton font échouer le second et déconnectaient à tort. Un seul renouvellement à la fois par onglet ; si le
  // serveur refuse, un autre onglet a pu renouveler entre-temps : on réessaie avec le jeton qu'il a enregistré.
  let renouvellement = null;
  function refresh() {
    renouvellement ??= (async () => {
      const tenter = async (r) => {
        const res = await fetch('/api/auth/token/refresh/', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: r }),
        });
        if (!res.ok) return false;
        jetons(await res.json());
        return true;
      };
      const r = store.get(K.refresh);
      if (!r) return false;
      if (await tenter(r)) return true;
      await new Promise((ok) => setTimeout(ok, 400));
      const r2 = store.get(K.refresh);
      return !!r2 && r2 !== r && tenter(r2);
    })().finally(() => { renouvellement = null; });
    return renouvellement;
  }

  // nouveau couple de jetons (connexion, renouvellement, changement de mot de passe qui révoque les anciens)
  function jetons(t) {
    if (t.access) store.set(K.access, t.access);
    if (t.refresh) store.set(K.refresh, t.refresh);
  }

  function logout() {
    store.del(K.access); store.del(K.refresh);
    location.href = '/';
  }

  async function api(path, options = {}, retried = false) {
    if (DEV) {
      if (path === '/api/me/') return { username: 'dev', role: 'technicien', roles: ['technicien', 'conducteur', 'commercial', 'direction'] };
      if (options.method && options.method !== 'GET') return { detail: 'Mode dev : écriture simulée', ...(options.body || {}) };
      const chemin = path.split('?')[0];
      const f = DEV_MAP[chemin] || (/^\/api\/chantiers\/[^/]+\/$/.test(chemin) && '/dev-data/chantier-detail.json')
        || (/^\/api\/dossiers\/\d+\/$/.test(chemin) && '/dev-data/dossier-detail.json');
      if (!f) throw new Error('Mode dev : pas de jeu d\'essai pour ' + path);
      return (await fetch(f)).json();
    }
    const headers = { ...(options.headers || {}) };
    if (options.body && typeof options.body !== 'string' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options = { ...options, body: JSON.stringify(options.body) };
    }
    const token = store.get(K.access);
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(path, { ...options, headers });
    if (options.brut && res.ok) return res; // réponse non JSON (HTML imprimable, xlsx, fichier) : l'appelant lit res.blob() / res.text()
    if (res.status === 401) {
      if (!retried && await refresh()) return api(path, options, true);
      logout();
      throw new Error('Session expirée');
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && (data.detail || JSON.stringify(data))) || res.statusText);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  async function login(username, password) {
    const res = await fetch('/api/auth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Identifiants invalides');
    const t = await res.json();
    jetons(t);
    return api('/api/me/');
  }

  let _cfg, _me;
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

  window.SIG = {
    DEV, api, login, logout, jetons,
    me: () => (_me ??= api('/api/me/')),
    config: () => (_cfg ??= api('/api/config/')),
    fmtFCFA: (n) => (n == null ? '—' : nf.format(n).replace(/ | /g, ' ') + ' FCFA'),
    fmtNum: (n) => (n == null ? '—' : nf.format(n).replace(/ | /g, ' ')),
    fmtPct: (r) => (r == null ? '—' : (r * 100).toFixed(1).replace('.', ',') + ' %'),
    // Échappement HTML obligatoire pour toute donnée injectée via innerHTML
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  };
})();
