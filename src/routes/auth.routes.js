const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifierToken } = require('../middlewares/auth.middleware');

// Routes publiques
router.post('/signup/citoyen', authController.inscrireCitoyen);
router.post('/signup/etablissement', authController.inscrireEtablissement);
router.post('/login', authController.connexion);

// Routes protégées
router.get('/me', verifierToken, authController.monProfil);

module.exports = router;