/**
 * Fonctions pures de logique métier FileZen
 *
 * Ce fichier contient toutes les fonctions pures (sans dépendances externes)
 * qui implémentent les règles métier critiques de l'application.
 * Importé par les controllers ET instrumenté par les tests unitaires.
 */

// ─── Créneaux horaires ────────────────────────────────────────────────────────

/**
 * Génère les créneaux horaires entre heureDebut et heureFin avec une durée fixe.
 * Saute la pause déjeuner si pauseDebut/pauseFin sont fournis.
 */
function genererSlotsHoraires(heureDebut, heureFin, dureeMinutes, pauseDebut = null, pauseFin = null) {
  const toMin = (h) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm; };
  const toHeure = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const debut  = toMin(heureDebut);
  const fin    = toMin(heureFin);
  const pauseD = pauseDebut ? toMin(pauseDebut) : null;
  const pauseF = pauseFin   ? toMin(pauseFin)   : null;

  const slots = [];
  let cursor = debut;

  while (cursor + dureeMinutes <= fin) {
    const slotFin = cursor + dureeMinutes;
    if (pauseD !== null && pauseF !== null) {
      if (cursor < pauseF && slotFin > pauseD) {
        cursor = pauseF;
        continue;
      }
    }
    slots.push({ heure_debut: toHeure(cursor), heure_fin: toHeure(slotFin) });
    cursor = slotFin;
  }
  return slots;
}

/**
 * Génère les créneaux pour un jour donné en vérifiant si le jour est actif.
 * Retourne [] si le jour n'est pas dans config.jours_actifs.
 */
function genererCreneauxPourJour(date, config) {
  const noms = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const nomJour = noms[date.getDay()];
  if (!config.jours_actifs || !config.jours_actifs.includes(nomJour)) return [];

  const toMin = (h) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm; };
  const toH   = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const slots = [];
  let cursor = toMin(config.heure_debut);
  const fin  = toMin(config.heure_fin);

  while (cursor + config.duree_creneau <= fin) {
    slots.push({ heure_debut: toH(cursor), heure_fin: toH(cursor + config.duree_creneau) });
    cursor += config.duree_creneau;
  }
  return slots;
}

/**
 * Calcule le nombre de créneaux dans une plage horaire.
 */
function calculerNbCreneaux(heureDebut, heureFin, dureeMinutes, pauseDebut = null, pauseFin = null) {
  const toMin = (h) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm; };
  const debut = toMin(heureDebut);
  const fin   = toMin(heureFin);
  let totalMinutes = fin - debut;

  if (pauseDebut && pauseFin) {
    const pd = toMin(pauseDebut);
    const pf = toMin(pauseFin);
    totalMinutes -= (pf - pd);
  }
  return Math.floor(totalMinutes / dureeMinutes);
}

/**
 * Détecte si deux créneaux horaires se chevauchent.
 * Algorithme : chevauchement si début1 < fin2 ET fin1 > début2.
 */
function seChevauchent(slot1, slot2) {
  const toMin = (h) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm; };
  const d1 = toMin(slot1.heure_debut), f1 = toMin(slot1.heure_fin);
  const d2 = toMin(slot2.heure_debut), f2 = toMin(slot2.heure_fin);
  return d1 < f2 && f1 > d2;
}

// ─── File d'attente ───────────────────────────────────────────────────────────

/**
 * Calcule le temps d'attente estimé en minutes.
 * Formule : position × temps_moyen_par_ticket.
 */
function calculerTempsAttente(position, tempsMoyenMinutes) {
  if (position <= 0) return 0;
  return position * tempsMoyenMinutes;
}

/**
 * Trie les tickets d'une file par numéro (ordre FIFO).
 * Ne modifie pas le tableau original (immutabilité).
 */
function trierFile(tickets) {
  return [...tickets].sort((a, b) => a.numero - b.numero);
}

// ─── Rendez-vous ──────────────────────────────────────────────────────────────

/**
 * Vérifie si un RDV peut être annulé (règle métier : > 24h avant).
 * Retourne true si l'annulation est autorisée.
 */
function peutAnnuler(dateRdv, maintenant = new Date()) {
  const diffMs     = new Date(dateRdv) - maintenant;
  const diffHeures = diffMs / (1000 * 60 * 60);
  return diffHeures > 24;
}

/**
 * Vérifie l'annulation et retourne un objet {autorise, raison}.
 */
function verifierAnnulationRDV(dateRdv, maintenant = new Date()) {
  const diffMs = new Date(dateRdv) - maintenant;
  const diffH  = diffMs / (1000 * 60 * 60);
  if (diffH <= 0)  return { autorise: false, raison: 'Le rendez-vous est déjà passé.' };
  if (diffH <= 24) return { autorise: false, raison: 'Annulation impossible moins de 24h avant le RDV.' };
  return { autorise: true, raison: null };
}

/**
 * Vérifie si une date est dans une fenêtre de temps (ex: rappel 24h).
 * Utilisé par le job de rappels automatiques.
 */
function dansLaFenetre(dateRdv, minHeures, maxHeures, maintenant = new Date()) {
  const diffMs     = new Date(dateRdv) - maintenant;
  const diffHeures = diffMs / (1000 * 60 * 60);
  return diffHeures >= minHeures && diffHeures <= maxHeures;
}

// ─── Téléphone & WhatsApp ─────────────────────────────────────────────────────

/**
 * Formate un numéro tunisien vers le format WhatsApp (216XXXXXXXX@c.us).
 */
function formatTunisianPhone(phone) {
  if (!phone) return null;
  const clean = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  let number = '';
  if (clean.startsWith('+216'))     number = clean.slice(1);
  else if (clean.startsWith('216')) number = clean;
  else if (clean.length === 8)      number = `216${clean}`;
  else return null;
  return `${number}@c.us`;
}

/**
 * Valide un numéro de téléphone tunisien (8 chiffres, préfixes 2/5/7/9).
 */
function validerTelephone(tel) {
  if (!tel) return false;
  const clean = tel.replace(/\s+/g, '').replace(/[^\d]/g, '');
  if (clean.length !== 8) return false;
  return /^[2579]\d{7}$/.test(clean);
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Valide un mot de passe (minimum 6 caractères).
 */
function validerMotDePasse(mdp) {
  if (!mdp || mdp.length < 6) return false;
  return true;
}

/**
 * Valide le format d'un email.
 */
function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

// ─── Formatage ────────────────────────────────────────────────────────────────

/**
 * Formate une durée en minutes pour l'affichage.
 * Ex: 30 → "30 min", 60 → "1h", 90 → "1h30"
 */
function formatDuree(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Formate une date en YYYY-MM-DD sans décalage UTC (bug timezone fix).
 * Utilise getFullYear/getMonth/getDate (heure locale) au lieu de toISOString (UTC).
 */
function formatDateLocale(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── Jours ouvrables ──────────────────────────────────────────────────────────

/**
 * Vérifie si un jour est ouvrable selon la liste des jours actifs du service.
 */
function estJourOuvrable(date, joursActifs) {
  const noms = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return joursActifs.includes(noms[date.getDay()]);
}

// ─── Signalements ─────────────────────────────────────────────────────────────

const SEUIL_SIGNALEMENTS = 5;

/**
 * Détermine si une alerte superadmin doit être envoyée pour un établissement.
 */
function alerteRequise(nbSignalements, alerteDejaEnvoyee) {
  return nbSignalements >= SEUIL_SIGNALEMENTS && !alerteDejaEnvoyee;
}

// ─── Génération codes ─────────────────────────────────────────────────────────

/**
 * Génère un code de vérification à 6 chiffres.
 */
function genererCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Créneaux
  genererSlotsHoraires,
  genererCreneauxPourJour,
  calculerNbCreneaux,
  seChevauchent,
  // File d'attente
  calculerTempsAttente,
  trierFile,
  // Rendez-vous
  peutAnnuler,
  verifierAnnulationRDV,
  dansLaFenetre,
  // Téléphone
  formatTunisianPhone,
  validerTelephone,
  // Validation
  validerMotDePasse,
  emailValide,
  // Formatage
  formatDuree,
  formatDateLocale,
  // Jours ouvrables
  estJourOuvrable,
  // Signalements
  alerteRequise,
  SEUIL_SIGNALEMENTS,
  // Codes
  genererCode,
};
