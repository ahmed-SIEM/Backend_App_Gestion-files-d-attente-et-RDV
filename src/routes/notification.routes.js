const express = require('express');
const router = express.Router();
const { verifierToken } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/notification.controller');

router.use(verifierToken); // toutes les routes sont protégées

router.get('/', ctrl.mesNotifications);
router.put('/tout-lire', ctrl.toutMarquerLu);
router.put('/:id/lire', ctrl.marquerLue);
router.delete('/:id', ctrl.supprimer);

module.exports = router;
