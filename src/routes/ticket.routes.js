const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticket.controller');
const { verifierToken, verifierRole } = require('../middlewares/auth.middleware');

// ===== ROUTES CITOYEN =====
router.post('/', 
  verifierToken, 
  verifierRole('citoyen'),
  ticketController.prendreTicket
);

router.get('/mes-tickets', 
  verifierToken, 
  verifierRole('citoyen'),
  ticketController.mesTickets
);

router.get('/:id', 
  verifierToken, 
  verifierRole('citoyen'),
  ticketController.detailsTicket
);

router.delete('/:id', 
  verifierToken, 
  verifierRole('citoyen'),
  ticketController.annulerTicket
);

// ===== ROUTES AGENT =====
router.get('/agent/file', 
  verifierToken, 
  verifierRole('agent'),
  ticketController.fileAttente
);

router.post('/agent/appeler', 
  verifierToken, 
  verifierRole('agent'),
  ticketController.appellerProchain
);

router.put('/agent/:id/servi', 
  verifierToken, 
  verifierRole('agent'),
  ticketController.marquerServi
);

router.put('/agent/:id/absent', 
  verifierToken, 
  verifierRole('agent'),
  ticketController.marquerAbsent
);

router.put('/agent/pause', 
  verifierToken, 
  verifierRole('agent'),
  ticketController.mettreEnPause
);

router.put('/agent/reprendre', 
  verifierToken, 
  verifierRole('agent'),
  ticketController.reprendreFile
);

router.get('/agent/stats', 
  verifierToken, 
  verifierRole('agent'),
  ticketController.statsAgent
);

module.exports = router;