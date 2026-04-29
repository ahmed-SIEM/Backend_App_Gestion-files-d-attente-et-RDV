const express = require('express');
const router = express.Router();
const rdvController = require('../controllers/rendezvous.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');

// ===== ROUTES CITOYEN =====
router.get('/creneaux',
  verifierToken,
  verifierRole('citoyen'),
  rdvController.creneauxDisponibles
);

router.post('/',
  verifierToken,
  verifierRole('citoyen'),
  rdvController.reserverRDV
);

router.get('/mes-rdv',
  verifierToken,
  verifierRole('citoyen'),
  rdvController.mesRDV
);

router.get('/:id',
  verifierToken,
  verifierRole('citoyen'),
  rdvController.detailsRDV
);

router.delete('/:id',
  verifierToken,
  verifierRole('citoyen'),
  rdvController.annulerRDV
);

router.put('/:id/reprogrammer',
  verifierToken,
  verifierRole('citoyen'),
  rdvController.reprogrammerRDV
);

// ===== ROUTES AGENT =====
router.get('/agent/jour',
  verifierToken,
  verifierRole('agent'),
  rdvController.mesRDVJour
);

// Vue secrétaire : tous les créneaux du jour avec RDV associés
router.get('/agent/creneaux-jour',
  verifierToken,
  verifierRole('agent'),
  rdvController.creneauxJour
);

// Reprogrammer un RDV (par l'agent — sans restriction 24h)
router.put('/agent/:id/reprogrammer',
  verifierToken,
  verifierRole('agent'),
  rdvController.reprogrammerRDVAgent
);

// Créer un RDV manuel (réservation par téléphone)
router.post('/agent/rdv-manuel',
  verifierToken,
  verifierRole('agent'),
  rdvController.creerRDVAgent
);

router.put('/agent/:id/present',
  verifierToken,
  verifierRole('agent'),
  rdvController.marquerPresent
);

router.put('/agent/:id/termine',
  verifierToken,
  verifierRole('agent'),
  rdvController.marquerTermine
);

router.put('/agent/:id/no-show',
  verifierToken,
  verifierRole('agent'),
  rdvController.marquerNoShow
);

// ===== ROUTES ADMIN ÉTABLISSEMENT =====

// Configurer le planning récurrent du service (remplace génération manuelle)
router.put('/service/:serviceId/config',
  verifierToken,
  verifierRole('admin_etablissement'),
  rdvController.configurerRDVService
);

// Ajouter une exception (jour férié, fermeture, fin anticipée)
router.post('/service/:serviceId/exception',
  verifierToken,
  verifierRole('admin_etablissement'),
  rdvController.ajouterException
);

// Supprimer une exception
router.delete('/service/:serviceId/exception',
  verifierToken,
  verifierRole('admin_etablissement'),
  rdvController.supprimerException
);

// Voir les créneaux d'un service (vue admin)
router.get('/service/:serviceId/creneaux',
  verifierToken,
  verifierRole('admin_etablissement'),
  rdvController.creneauxService
);

// Anciennes routes conservées pour compatibilité frontend
router.put('/service/:serviceId/horaires',
  verifierToken,
  verifierRole('admin_etablissement'),
  rdvController.configurerHorairesService
);

router.post('/service/:serviceId/generer-creneaux',
  verifierToken,
  verifierRole('admin_etablissement'),
  rdvController.genererCreneaux
);

module.exports = router;
