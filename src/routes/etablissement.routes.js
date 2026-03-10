const express = require('express');
const router = express.Router();
const etablissementController = require('../controllers/etablissement.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');

// Routes publiques
router.get('/', etablissementController.listerEtablissements);
router.get('/:id', etablissementController.detailsEtablissement);

// Routes Admin Établissement
router.get('/me/etablissement', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  etablissementController.monEtablissement
);

router.put('/me/etablissement', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  etablissementController.modifierEtablissement
);

// Routes Super-Admin
router.get('/admin/demandes', 
  verifierToken, 
  verifierRole('super_admin'),
  etablissementController.demandesEnAttente
);

router.put('/admin/:id/approuver', 
  verifierToken, 
  verifierRole('super_admin'),
  etablissementController.approuverEtablissement
);

router.put('/admin/:id/rejeter', 
  verifierToken, 
  verifierRole('super_admin'),
  etablissementController.rejeterEtablissement
);

router.put('/admin/:id/suspendre', 
  verifierToken, 
  verifierRole('super_admin'),
  etablissementController.suspendreEtablissement
);

router.delete('/admin/:id', 
  verifierToken, 
  verifierRole('super_admin'),
  etablissementController.supprimerEtablissement
);

module.exports = router;