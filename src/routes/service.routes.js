const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/service.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');

// Routes publiques
router.get('/etablissement/:etablissementId', serviceController.listerServices);
router.get('/:id', serviceController.detailsService);

// ⭐ NOUVELLE ROUTE: Stats publiques d'un service
router.get('/:id/stats', serviceController.statsService);

// Routes Admin Établissement
router.get('/me/services', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  serviceController.mesServices
);

router.post('/', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  serviceController.creerService
);

router.put('/:id', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  serviceController.modifierService
);

router.delete('/:id', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  serviceController.supprimerService
);

router.patch('/:id/toggle', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  serviceController.toggleService
);

module.exports = router;