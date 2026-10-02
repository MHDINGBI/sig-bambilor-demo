// Onglet Clients — Espace Client Moderne & Cockpit Recouvrement
// Page Tableau / Grille de Cartes plein écran + Page Fiche 360° dédiée avec bouton retour.
// Point d'entrée (module ES) : vue, écouteurs et API publique APP.clients. Le code est réparti
// dans clients/ : commun, liste, fiche, rapport, suggestions (audit 23/09, R09).
import { ACTES, ALERTES, CHAMPS, dateFr, estFrais, etat, filtres, FORMATS, PIECES } from './clients/commun.js';
import { basculerTexte, chargerJournalClient, courant, enregistrerProfil, fermerFiche, ouvrirClient, ouvrirNouveauClient, ouvrirPage, panneauRattachement, pdfBlob, rapprocherProfil, rattacherScan, selectionnerLotContrat, telechargerFichierCommercial, validerNouveauClient } from './clients/fiche.js';
import { ouvrirDocument } from './dossiers/documents.js';
import { agGridLocaleFr, appliquerFiltres, charger, themeGrille } from './clients/liste.js';
import { afficherApercuRapport, exporterCSV, telechargerRapportHTML, telechargerRapportPDF } from './clients/rapport.js';
import { choisirSuggestion, dessinerSuggestions, fermerSuggestions, majSuggestionActive, suggestionsCourantes, suggestionsSaisie } from './clients/suggestions.js';
const { $ } = APP;

// Chargement en cours. Le routeur rappelle `afficher` à chaque entrée sur la vue : sans cette
// promesse partagée, deux appels simultanés déclenchaient deux fois la requête clients.
let enCours = null;

async function afficher(r) {
  if (!etat.donnees && !enCours) enCours = charger().finally(() => (enCours = null));
  if (enCours) await enCours;
  if (r && r.ref) {
    ouvrirClient(r.ref);
  } else if (r && r.lot) {
    ouvrirClient(r.lot);
  } else {
    fermerFiche();
  }
}

// Initialisation des écouteurs d'événements
document.addEventListener('DOMContentLoaded', () => {
  // 1. Champ de recherche instantanée. Toute la liste est redessinée à chaque filtrage (876 lignes
  //    rendues : voir domLayout autoHeight), donc on attend une courte pause de frappe — sans cela,
  //    chaque touche coûte entre 120 et 730 ms. Les suggestions, elles, se recalculent tout de suite :
  //    parcourir les 876 clients coûte ≈ 1 ms, contrairement au redessin de la grille.
  const inputQ = $('cl-q');
  if (inputQ) {
    let minuteurRecherche = null;
    inputQ.addEventListener('input', () => {
      dessinerSuggestions(suggestionsSaisie(inputQ.value), inputQ.value.trim());
      clearTimeout(minuteurRecherche);
      minuteurRecherche = setTimeout(() => { if (etat.donnees) appliquerFiltres(); }, 180);
    });
    // Clavier : ↑↓ parcourent, Entrée prend la suggestion, Échap referme la liste sans effacer la saisie.
    inputQ.addEventListener('keydown', (e) => {
      const zone = $('cl-suggestions');
      if (!zone || zone.hidden || !suggestionsCourantes.length) return;
      const n = suggestionsCourantes.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); etat.suggestionActive = (etat.suggestionActive + 1) % n; majSuggestionActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); etat.suggestionActive = (etat.suggestionActive - 1 + n) % n; majSuggestionActive(); }
      else if (e.key === 'Enter') { e.preventDefault(); choisirSuggestion(etat.suggestionActive >= 0 ? etat.suggestionActive : 0); }
      else if (e.key === 'Escape') { e.preventDefault(); fermerSuggestions(); }
    });
    inputQ.addEventListener('blur', () => setTimeout(fermerSuggestions, 120));
    const zoneSug = $('cl-suggestions');
    if (zoneSug) {
      // mousedown et non click : le champ perdrait le focus (et la liste se refermerait) avant que
      // le clic n'aboutisse.
      zoneSug.addEventListener('mousedown', (e) => {
        const li = e.target.closest('.cl-suggestion');
        if (!li) return;
        e.preventDefault();
        choisirSuggestion(Number(li.dataset.index));
      });
    }
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.cl-recherche-input-wrap')) fermerSuggestions();
    });
  }

  // 1.1 Boutons de création en-tête
  const btnNouveauClient = $('cl-btn-nouveau-client');
  if (btnNouveauClient) btnNouveauClient.addEventListener('click', ouvrirNouveauClient);

  const btnNouveauDossier = $('cl-btn-nouveau-dossier');
  if (btnNouveauDossier) {
    btnNouveauDossier.addEventListener('click', () => {
      if (APP.dossiers && APP.dossiers.ouvrirAssistant) {
        APP.dossiers.ouvrirAssistant();
      }
    });
  }

  // 1.2 Modale Nouveau Client
  const btnNcAnnuler = $('cl-nc-annuler');
  if (btnNcAnnuler) btnNcAnnuler.addEventListener('click', () => $('cl-dlg-nouveau-client')?.close());

  const btnNcValider = $('cl-nc-valider');
  if (btnNcValider) btnNcValider.addEventListener('click', validerNouveauClient);

  // 1.3 Clics rapides sur les mini-KPIs
  const kpisGroupe = document.querySelector('.cl-kpis-groupe');
  if (kpisGroupe) {
    kpisGroupe.addEventListener('click', (e) => {
      const item = e.target.closest('.cl-kpi-item');
      if (!item) return;
      if (item.classList.contains('cl-kpi-succes')) {
        filtres.compte.clear();
        filtres.compte.add('solde');
      } else if (item.classList.contains('cl-kpi-impayes')) {
        filtres.compte.clear();
        filtres.compte.add('impaye');
      } else if (item.classList.contains('cl-kpi-orange')) {
        filtres.dossier.clear();
        filtres.dossier.add('sans-dossier');
      } else if (item.classList.contains('cl-kpi-remb')) {
        filtres.vigilance.clear();
        filtres.vigilance.add('remboursement');
      } else if (item.classList.contains('cl-kpi-contentieux')) {
        filtres.vigilance.clear();
        filtres.vigilance.add('contentieux');
      }
      appliquerFiltres();
    });
  }

  // 2. Clic sur les chips de filtres
  const conteneurChips = document.querySelector('.cl-filtres-chips');
  if (conteneurChips) {
    conteneurChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.cl-chip[data-groupe]');
      if (!chip) return;
      const g = chip.dataset.groupe;
      const v = chip.dataset.valeur;
      if (!filtres[g]) return;

      if (filtres[g].has(v)) {
        filtres[g].delete(v);
      } else {
        filtres[g].add(v);
      }
      appliquerFiltres();
    });
  }

  // 3. Bouton réinitialiser tout
  const btnReinit = $('cl-btn-reinit');
  if (btnReinit) {
    btnReinit.addEventListener('click', () => {
      filtres.dossier.clear();
      filtres.livraison.clear();
      filtres.phase.clear();
      filtres.compte.clear();
      filtres.vigilance.clear();
      filtres.ged.clear();
      if ($('cl-q')) $('cl-q').value = '';
      appliquerFiltres();
    });
  }

  // 4. Clic sur une pilule active pour la supprimer
  const conteneurPills = $('cl-pills-actives');
  if (conteneurPills) {
    conteneurPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.cl-pill');
      if (!pill) return;
      const g = pill.dataset.groupe;
      const v = pill.dataset.valeur;
      if (filtres[g]) {
        filtres[g].delete(v);
        appliquerFiltres();
      }
    });
  }

  // 5. Tri et filtres : ils appartiennent à la grille (en-têtes, menus de colonne). Ici, seul le
  //    changement de thème demande de la reconstruire — AG Grid lit ses couleurs à la création
  //    et ne relit pas les variables CSS.
  document.addEventListener('sig:theme', () => {
    if (!etat.grille) return;
    etat.grille.destroy();
    etat.grille = null;
    appliquerFiltres();
  });

  // 6. Boutons Rapport d'état et exports
  const btnRapportApercu = $('cl-btn-rapport-apercu');
  if (btnRapportApercu) btnRapportApercu.addEventListener('click', afficherApercuRapport);

  const btnRapportPdf = $('cl-btn-rapport-pdf');
  if (btnRapportPdf) btnRapportPdf.addEventListener('click', telechargerRapportPDF);

  // 7. Bouton Export CSV
  const btnExport = $('cl-export-table');
  if (btnExport) btnExport.addEventListener('click', exporterCSV);

  // Actions au sein du dialogue d'aperçu du rapport
  const dlgRap = $('cl-dialogue-rapport');
  const btnRapPdf = $('cl-rap-telecharger-pdf');
  if (btnRapPdf) btnRapPdf.addEventListener('click', telechargerRapportPDF);

  const btnRapHtml = $('cl-rap-telecharger-html');
  if (btnRapHtml) btnRapHtml.addEventListener('click', telechargerRapportHTML);

  const btnRapImprimer = $('cl-rap-imprimer');
  if (btnRapImprimer) btnRapImprimer.addEventListener('click', () => {
    const cadre = $('cl-rap-cadre');
    if (cadre && cadre.contentWindow) cadre.contentWindow.print();
  });

  const btnRapFermer = $('cl-rap-fermer');
  if (btnRapFermer) btnRapFermer.addEventListener('click', () => dlgRap?.close());
  if (dlgRap) dlgRap.addEventListener('close', () => {
    if (etat.rapportApercuUrl) {
      URL.revokeObjectURL(etat.rapportApercuUrl);
      etat.rapportApercuUrl = null;
    }
  });

  // 8. Bouton retour de la fiche client
  const btnRetour = $('cl-btn-retour');
  if (btnRetour) btnRetour.addEventListener('click', fermerFiche);

  // 9. Touche Échap pour fermer la fiche client si elle est ouverte
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && courant) {
      fermerFiche();
    }
  });

  // 10. Événements au sein de vue-clients (sélection client, onglets, visionneuse, relevé)
  // 10. Événements au sein de vue-clients (sélection client, onglets, visionneuse, relevé, actions)
  const vueClients = $('vue-clients');
  if (vueClients) {
    vueClients.addEventListener('input', (e) => {
      if (e.target.id === 'cl-rattacher-q' && courant) panneauRattachement(courant, e.target.value);
    });
    vueClients.addEventListener('keydown', (e) => {
      const carte = e.target.closest('.cl-dossier-carte[role="tab"]');
      if (carte && e.target === carte && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        selectionnerLotContrat(carte.dataset.lotContrat);
      }
    });
    vueClients.addEventListener('click', (e) => {
      const lotContrat = e.target.closest('[data-lot-contrat]');
      if (lotContrat) {
        e.preventDefault();
        selectionnerLotContrat(lotContrat.dataset.lotContrat);
        return;
      }
      // Visionneuse PDF
      const bDoc = e.target.closest('[data-doc]');
      if (bDoc) {
        e.preventDefault();
        ouvrirPage(Number(bDoc.dataset.doc), Number(bDoc.dataset.page || 1));
        return;
      }

      // Rattacher un dossier scanné à ce client
      const btnRatt = e.target.closest('[data-action="rattacher-scan"]');
      if (btnRatt) { e.preventDefault(); panneauRattachement(btnRatt.dataset.ref, ''); return; }
      if (e.target.closest('[data-action="fermer-rattacher-scan"]')) { const z = $('cl-rattacher-scan'); if (z) z.hidden = true; return; }
      const btnRattScan = e.target.closest('[data-rattacher-scan]');
      if (btnRattScan) { e.preventDefault(); rattacherScan(Number(btnRattScan.dataset.rattacherScan), btnRattScan.dataset.ref, btnRattScan); return; }

      // Documents du contrat choisi (en-tête de la fiche) et relevé d'une ligne de la liste
      const bContratDoc = e.target.closest('[data-contrat-doc]');
      if (bContratDoc) {
        e.preventDefault();
        APP.dossiers.ouvrirDocumentContrat(bContratDoc.dataset.contratDoc, bContratDoc.textContent.trim());
        return;
      }
      if (e.target.closest('[data-contrat-desistement]')) { e.preventDefault(); APP.dossiers.ouvrirDesistement(); return; }
      const bGen = e.target.closest('[data-gen-doc][data-dossier-id]');
      if (bGen) { e.preventDefault(); ouvrirDocument(bGen.dataset.genDoc, Number(bGen.dataset.dossierId), 'Relevé'); return; }

      // Onglet interne de la fiche 360° (compatibilité)
      const ongletBtn = e.target.closest('.cl-onglet-btn[data-onglet]');
      if (ongletBtn) {
        const onglet = ongletBtn.dataset.onglet;
        filtres.ongletFiche = onglet;
        document.querySelectorAll('.cl-onglet-btn').forEach((b) => b.classList.remove('actif'));
        ongletBtn.classList.add('actif');
        document.querySelectorAll('.cl-onglet-panneau').forEach((p) => p.classList.remove('actif'));
        const pCible = $('cl-panneau-' + onglet);
        if (pCible) pCible.classList.add('actif');
        if (onglet === 'journal' && courant) chargerJournalClient(courant.ref);
        return;
      }

      const btnActuJournal = e.target.closest('#cl-journal-actualiser');
      if (btnActuJournal) {
        e.preventDefault();
        chargerJournalClient(btnActuJournal.dataset.ref);
        return;
      }
      // Changement de perspective métier (Design 3)
      const btnRole = e.target.closest('[data-role-vue]');
      if (btnRole) {
        e.preventDefault();
        etat.roleVue = btnRole.dataset.roleVue;
        if (courant) ouvrirClient(courant);
        return;
      }

      // Action Rapprocher OCR (synchronisation 1-clic avec les scans)
      const btnRapprocher = e.target.closest('[data-action="rapprocher-ocr"]');
      if (btnRapprocher) {
        e.preventDefault();
        rapprocherProfil(btnRapprocher.dataset.ref);
        return;
      }

      // Action Exporter vers Excel (classeur commercial réimportable)
      const btnExcel = e.target.closest('[data-action="export-excel"]');
      if (btnExcel) {
        e.preventDefault();
        telechargerFichierCommercial(btnExcel.dataset.ref || null);
        return;
      }

      // Action Créer Dossier / Affecter un lot (depuis tableau ou fiche 360°)
      const btnCreerDossier = e.target.closest('[data-action="creer-dossier"]');
      if (btnCreerDossier) {
        e.preventDefault();
        const ref = btnCreerDossier.dataset.ref;
        const clData = (etat.donnees && etat.donnees.clients ? etat.donnees.clients.find((x) => x.ref === ref) : null);
        if (APP.dossiers && APP.dossiers.ouvrirAssistant) {
          APP.dossiers.ouvrirAssistant({
            ref: ref,
            acquereur_ref: ref,
            nom: (clData && clData.nom) || ref,
            telephone: clData && clData.telephone,
          });
        }
        return;
      }

      // Action Réaffecter Lot (changer le lot d'un dossier commercial)
      const btnReaffecter = e.target.closest('[data-action="reaffecter-lot"]');
      if (btnReaffecter) {
        e.preventDefault();
        const dossierId = Number(btnReaffecter.dataset.dossierId);
        const lot = btnReaffecter.dataset.lot || '';
        if (APP.dossiers && APP.dossiers.ouvrirReaffectation) {
          APP.dossiers.ouvrirReaffectation(lot, dossierId);
        }
        return;
      }

      // Action Rattacher un lot : deux villas, un seul règlement
      const btnRattacher = e.target.closest('[data-action="rattacher-lot"]');
      if (btnRattacher) {
        e.preventDefault();
        if (APP.dossiers && APP.dossiers.ouvrirRattachement) APP.dossiers.ouvrirRattachement(Number(btnRattacher.dataset.dossierId));
        return;
      }

      // Action Affecter Lot à un dossier sans lot
      const btnAffecter = e.target.closest('[data-action="affecter-lot"]');
      if (btnAffecter) {
        e.preventDefault();
        const dossierId = Number(btnAffecter.dataset.dossierId);
        if (APP.dossiers && APP.dossiers.ouvrirReaffectation) {
          APP.dossiers.ouvrirReaffectation('', dossierId);
        }
        return;
      }

      // Action Versement sur dossier commercial
      const btnVersement = e.target.closest('[data-action="versement"]');
      if (btnVersement) {
        e.preventDefault();
        const dossierId = Number(btnVersement.dataset.dossierId);
        if (APP.dossiers && APP.dossiers.ouvrirVersement) {
          APP.dossiers.ouvrirVersement(null, dossierId);
        }
        return;
      }

      // Action Enregistrer Coordonnées Client (onglet Profil)
      const btnSauvProfil = e.target.closest('#cl-p-enregistrer');
      if (btnSauvProfil) {
        e.preventDefault();
        enregistrerProfil(btnSauvProfil.dataset.ref, btnSauvProfil.dataset.acquereur);
        return;
      }

      // Clic sur bouton action "Fiche" ou élément cliquable d'ouverture
      const btnFiche = e.target.closest('[data-action="voir-fiche"]');
      if (btnFiche) {
        ouvrirClient(btnFiche.dataset.ref);
        return;
      }

      // Clic sur un lien cl-liste a
      const aListe = e.target.closest('#cl-liste a[data-ref]');
      if (aListe) {
        e.preventDefault();
        ouvrirClient(aListe.dataset.ref);
        return;
      }

      // Clic sur une ligne de tableau pour ouvrir le client
      const tr = e.target.closest('#cl-table-corps tr[data-ref]');
      if (tr && !e.target.closest('button')) {
        ouvrirClient(tr.dataset.ref);
        return;
      }
    });
  }

  // 11. Visionneuse modale
  const btnVFermer = $('cl-v-fermer');
  if (btnVFermer) btnVFermer.addEventListener('click', () => $('cl-visionneuse').close());
  const btnVTexte = $('cl-v-texte');
  if (btnVTexte) btnVTexte.addEventListener('click', basculerTexte);
});

APP.vues.clients = { afficher };
// themeGrille / localeFr : réutilisés par contentieux.js, qui affiche la même grille AG Grid.
// suggestions : la recherche globale (Ctrl+K) s'en sert pour proposer des compléments de saisie
// sans rappeler l'API — voir recherche.js.
APP.clients = {
  ouvrirPage, pdfUrl: pdfBlob, ACTES, ALERTES, CHAMPS, FORMATS, PIECES, dateFr, estFrais,
  // Lu par dossiers/versements.js pour rafraîchir la carte du contrat après un versement
  get courant() { return courant; },
  ouvrirClient, fermerFiche, themeGrille, localeFr: agGridLocaleFr, suggestions: suggestionsSaisie,
  afficherApercuRapport, telechargerRapportPDF, telechargerRapportHTML, exporterCSV
};
