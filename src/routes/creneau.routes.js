const express = require('express');
const router = express.Router();
const creneauController = require('../controllers/creneau.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');

// ===== ROUTES AGENT =====
router.get('/calendrier', 
  verifierToken, 
  verifierRole('agent'),
  creneauController.monCalendrier
);

router.get('/', 
  verifierToken, 
  verifierRole('agent'),
  creneauController.mesCreneaux
);

router.post('/', 
  verifierToken, 
  verifierRole('agent'),
  creneauController.ajouterCreneau
);

router.put('/:id/bloquer', 
  verifierToken, 
  verifierRole('agent'),
  creneauController.bloquerCreneau
);

router.put('/:id/debloquer', 
  verifierToken, 
  verifierRole('agent'),
  creneauController.debloquerCreneau
);

router.delete('/:id', 
  verifierToken, 
  verifierRole('agent'),
  creneauController.supprimerCreneau
);

module.exports = router;