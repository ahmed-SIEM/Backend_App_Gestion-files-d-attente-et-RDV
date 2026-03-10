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

module.exports = router;