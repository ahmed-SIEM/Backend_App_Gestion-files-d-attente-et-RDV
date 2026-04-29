const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');

// Routes Admin Établissement
router.post('/', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  agentController.creerAgent
);

router.get('/', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  agentController.mesAgents
);

router.put('/:id', 
  verifierToken, 
  verifierRole('admin_etablissement'),
  agentController.modifierAgent
);

router.delete('/:id',
  verifierToken,
  verifierRole('admin_etablissement'),
  agentController.supprimerAgent
);

router.put('/:id/assigner-service',
  verifierToken,
  verifierRole('admin_etablissement'),
  agentController.assignerService
);

module.exports = router;