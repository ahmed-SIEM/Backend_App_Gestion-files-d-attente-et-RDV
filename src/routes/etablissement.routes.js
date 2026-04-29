const express = require('express');
const router = express.Router();
const etablissementController = require('../controllers/etablissement.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');
const { uploadDocument, uploadEtablissement } = require('../middlewares/upload.middleware');

// ============================================
// ROUTES SUPER ADMIN (EN PREMIER - SPÉCIFIQUES)
// ============================================

router.get('/en-attente',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.demandesEnAttente
);

router.get('/tous',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.tousLesEtablissements
);

router.put('/:id/valider',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.approuverEtablissement
);

router.put('/:id/rejeter',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.rejeterEtablissement
);

router.put('/:id/suspendre',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.suspendreEtablissement
);

router.put('/:id/activer',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.activerEtablissement
);

router.delete('/:id',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.supprimerEtablissement
);

// ============================================
// UPLOAD (PUBLIC - lors de l'inscription)
// ============================================

// Upload documents justificatifs (PDF, images)
router.post('/upload-documents',
  uploadDocument.array('documents', 10),
  etablissementController.uploadDocuments
);

// ============================================
// ROUTES ADMIN ÉTABLISSEMENT
// ============================================

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

// Upload photo de l'établissement
router.post('/me/photo',
  verifierToken,
  verifierRole('admin_etablissement'),
  uploadEtablissement.single('photo'),
  etablissementController.uploadPhotoEtablissement
);

// ============================================
// SIGNALEMENTS — SUPER ADMIN
// ============================================
router.get('/signales',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.etablissementsSignales
);

router.get('/:id/signalements',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.signalementsEtablissement
);

router.delete('/:id/signalements',
  verifierToken,
  verifierRole('super_admin'),
  etablissementController.reinitialiserSignalements
);

// ============================================
// SIGNALEMENT — CITOYEN
// ============================================
router.post('/:id/signaler',
  verifierToken,
  verifierRole('citoyen'),
  etablissementController.signalerEtablissement
);

// ============================================
// ROUTES PUBLIQUES (À LA FIN)
// ============================================
router.get('/', etablissementController.listerEtablissements);
router.get('/:id', etablissementController.detailsEtablissement);

module.exports = router;
