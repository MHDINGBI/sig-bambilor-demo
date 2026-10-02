// Espace client : fiche 360° d'un client (dossiers, versements, scans, profil, relevé, nouveau client).
// Découpage : ouverture et assemblage dans fiche/ouverture.js, rendus par onglet dans contrats.js / versements.js /
// scans.js / profil.js / remboursements.js, visionneuse PDF, rattachement de scans et actions dans leurs modules ;
// état et petits rendus partagés dans fiche/commun.js. Cette racine ne fait que ré-exporter l'API publique.
export { courant, fermerFiche, ouvrirClient, selectionnerLotContrat } from './fiche/ouverture.js';
export { chargerJournalClient, enregistrerProfil, ouvrirNouveauClient, rapprocherProfil, telechargerFichierCommercial, validerNouveauClient } from './fiche/actions.js';
export { panneauRattachement, rattacherScan } from './fiche/rattachement.js';
export { basculerTexte, ouvrirPage, pdfBlob } from './fiche/visionneuse.js';
