// Fiche client : carte identité & coordonnées de l'acquéreur (rendu et lecture du formulaire).
const { $, esc } = APP;

export const CHAMPS_PROFIL = ['civilite', 'nom', 'prenoms', 'piece_type', 'piece_numero', 'telephone', 'email', 'adresse', 'profession', 'date_naissance', 'lieu_naissance', 'nationalite'];
export function valeursProfil() {
  const nom = ($('cl-p-nom')?.value || '').trim();
  const prenoms = ($('cl-p-prenoms')?.value || '').trim();
  const civilite = $('cl-p-civilite')?.value || null;
  const telephone = ($('cl-p-telephone')?.value || '').trim();
  const email = ($('cl-p-email')?.value || '').trim();
  const adresse = ($('cl-p-adresse')?.value || '').trim();
  const profession = ($('cl-p-profession')?.value || '').trim();
  const piece_type = $('cl-p-piece-type')?.value || 'CNI';
  const piece_numero = ($('cl-p-piece')?.value || '').trim();
  const date_naissance = $('cl-p-date-naissance')?.value || null;
  const lieu_naissance = ($('cl-p-lieu-naissance')?.value || '').trim() || null;
  const nationalite = ($('cl-p-nationalite')?.value || '').trim() || null;
  return { civilite, nom, prenoms: prenoms || null, piece_type, piece_numero: piece_numero || null, telephone: telephone || null, email: email || null, adresse: adresse || null, profession: profession || null, date_naissance, lieu_naissance, nationalite };
}
export function origineProfil(acq) {
  const org = {};
  for (const k of CHAMPS_PROFIL) {
    org[k] = k === 'date_naissance' && acq[k] ? String(acq[k]).slice(0, 10) : (acq[k] ?? null);
  }
  return org;
}

// ---------- CARTE IDENTITÉ & COORDONNÉES DE L'ACQUÉREUR (COLONNE GAUCHE) ----------
export function profilCardHTML(c, roleActif) {
  const acq = c.acquereur || {};
  const peutEditer = !SIG.DEMO && ( roleActif === 'commercial' || roleActif === 'direction' || roleActif === 'recouvrement');

  return `
    <div class="cl-card" id="cl-panneau-profil">
      <div class="cl-card-entete">
        <h4 class="cl-card-titre">Identité & coordonnées de l’acquéreur</h4>
        <span class="cl-badge doux">${acq.id ? '#' + acq.id : 'Enregistré'}</span>
      </div>

      ${roleActif === 'recouvrement' ? `
        <!-- Pavé prioritaire Recouvrement pour relance directe -->
        <div style="background:var(--creux);border-radius:6px;padding:12px;margin-bottom:14px;border-left:3px solid #86282b;">
          <div class="c-etiquette" style="font-size:0.6562rem;color:#86282b;margin-bottom:4px;">Contact direct pour relance</div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            <div>Tél. ${acq.telephone ? `<a href="tel:${esc(acq.telephone)}" style="font-weight:700;font-size:0.8438rem;color:var(--encre);">${esc(acq.telephone)}</a>` : '<span class="aide">Téléphone manquant</span>'}</div>
            <div>E-mail ${acq.email ? `<a href="mailto:${esc(acq.email)}" style="font-weight:600;font-size:0.7812rem;color:var(--accent);">${esc(acq.email)}</a>` : '<span class="aide">Email manquant</span>'}</div>
            <div style="font-size:0.75rem;color:var(--gris);">Adresse ${esc(acq.adresse || 'manquante')}</div>
          </div>
        </div>
      ` : ''}

      ${(acq.cotitulaires || acq.entite) ? `
        <!-- Villa acquise à plusieurs ou par une société pour son employé : le dossier ne porte
             qu'une référence d'acquéreur, ces deux champs rétablissent la situation réelle. -->
        <div class="cl-situation">
          ${acq.cotitulaires ? `<div><span class="c-etiquette">Co-titulaires</span>${esc(acq.cotitulaires)}</div>` : ''}
          ${acq.entite ? `<div><span class="c-etiquette">Acquise par</span>${esc(acq.entite)}</div>` : ''}
        </div>
      ` : ''}

      <div class="cl-form-grille">
        <div class="cl-champ-groupe"${APP.ancre('champ', 'civilite', 'Identité — Civilité')}>
          <label for="cl-p-civilite">Civilité</label>
          <select id="cl-p-civilite" ${peutEditer ? '' : 'disabled'}>
            <!-- Option neutre en tête : sans elle, une civilité inconnue s'affichait « M. »
                 (le navigateur retient la première option du <select>) alors que 875 fiches
                 sur 877 ne portent aucune civilité. -->
            <option value="" ${acq.civilite ? '' : 'selected'}>—</option>
            <option value="M." ${acq.civilite === 'M.' ? 'selected' : ''}>M.</option>
            <option value="Mme" ${acq.civilite === 'Mme' ? 'selected' : ''}>Mme</option>
            <option value="Mlle" ${acq.civilite === 'Mlle' ? 'selected' : ''}>Mlle</option>
            <option value="Société" ${acq.civilite === 'Société' ? 'selected' : ''}>Société</option>
          </select>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'nom', 'Identité — Nom de famille *')} style="grid-column: span 2;">
          <label for="cl-p-nom">Nom de famille *</label>
          <input type="text" id="cl-p-nom" value="${esc(acq.nom || c.nom || '')}" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-pleine cl-champ-groupe"${APP.ancre('champ', 'prenoms', 'Identité — Prénoms')}>
          <label for="cl-p-prenoms">Prénoms</label>
          <input type="text" id="cl-p-prenoms" value="${esc(acq.prenoms || '')}" placeholder="Prénoms de l'acquéreur" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'piece_type', 'Identité — Type Pièce')}>
          <label for="cl-p-piece-type">Type Pièce</label>
          <select id="cl-p-piece-type" ${peutEditer ? '' : 'disabled'}>
            <option value="CNI" ${acq.piece_type === 'CNI' ? 'selected' : ''}>CNI</option>
            <option value="Passeport" ${acq.piece_type === 'Passeport' ? 'selected' : ''}>Passeport</option>
            <option value="Autre" ${acq.piece_type === 'Autre' ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'piece_numero', 'Identité — Numéro de pièce')} style="grid-column: span 2;">
          <label for="cl-p-piece">Numéro de pièce</label>
          <input type="text" id="cl-p-piece" value="${esc(acq.piece_numero || '')}" placeholder="N° CNI ou Passeport" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'date_naissance', 'Identité — Date naissance')}>
          <label for="cl-p-date-naissance">Date naissance</label>
          <input type="date" id="cl-p-date-naissance" value="${acq.date_naissance ? String(acq.date_naissance).slice(0, 10) : ''}" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'lieu_naissance', 'Identité — Lieu de naissance')} style="grid-column: span 2;">
          <label for="cl-p-lieu-naissance">Lieu de naissance</label>
          <input type="text" id="cl-p-lieu-naissance" value="${esc(acq.lieu_naissance || '')}" placeholder="Ville de naissance" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'nationalite', 'Identité — Nationalité')}>
          <label for="cl-p-nationalite">Nationalité</label>
          <input type="text" id="cl-p-nationalite" value="${esc(acq.nationalite || 'Sénégalaise')}" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'profession', 'Identité — Profession')} style="grid-column: span 2;">
          <label for="cl-p-profession">Profession</label>
          <input type="text" id="cl-p-profession" value="${esc(acq.profession || '')}" placeholder="Ex: Économiste" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'telephone', 'Identité — Téléphone')}>
          <label for="cl-p-telephone">Téléphone</label>
          <input type="tel" id="cl-p-telephone" value="${esc(acq.telephone || '')}" placeholder="+221 ..." ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-groupe"${APP.ancre('champ', 'email', 'Identité — E-mail')} style="grid-column: span 2;">
          <label for="cl-p-email">E-mail</label>
          <input type="email" id="cl-p-email" value="${esc(acq.email || '')}" placeholder="email@exemple.com" ${peutEditer ? '' : 'disabled'}>
        </div>
        <div class="cl-champ-pleine cl-champ-groupe"${APP.ancre('champ', 'adresse', 'Identité — Adresse de résidence')}>
          <label for="cl-p-adresse">Adresse de résidence</label>
          <input type="text" id="cl-p-adresse" value="${esc(acq.adresse || '')}" placeholder="Adresse complète" ${peutEditer ? '' : 'disabled'}>
        </div>
      </div>

      <div id="cl-p-msg" style="margin-top:10px;"></div>

      ${peutEditer ? `
        <div class="cl-profil-actions">
          <button type="button" class="bouton" id="cl-p-enregistrer" data-ref="${esc(c.ref)}" data-acquereur="${acq.id ?? ''}">
            Enregistrer les coordonnées
          </button>
          <span class="aide" style="font-size:0.6875rem;">Mise à jour en direct</span>
        </div>
      ` : ''}
    </div>
  `;
}
