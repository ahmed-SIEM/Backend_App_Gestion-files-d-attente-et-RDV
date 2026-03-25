const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');

// Dashboard établissement
router.get('/etablissement/:etablissementId/dashboard', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  statsController.getDashboardEtablissement
);

// Dashboard plateforme (Super Admin)
router.get('/plateforme/dashboard', 
  verifierToken, 
  verifierRole('super_admin'),
  statsController.getDashboardPlateforme
);

// Stats détaillées établissement
router.get('/etablissement/:etablissementId', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  statsController.getStatsDetaillees
);

module.exports = router;