const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'ticket_appele',       // C'est votre tour
      'ticket_annule',       // Ticket annulé
      'rdv_confirme',        // RDV confirmé
      'rdv_annule',          // RDV annulé
      'rdv_rappel',          // Rappel RDV
      'etablissement_valide',// Établissement approuvé
      'etablissement_rejete',// Établissement rejeté
      'etablissement_suspendu', // Établissement suspendu
      'agent_cree',          // Compte agent créé
      'info'                 // Message général
    ],
    required: true
  },
  titre: { type: String, required: true },
  message: { type: String, required: true },
  lu: { type: Boolean, default: false },
  lien: { type: String, default: null }, // URL vers laquelle rediriger au clic
  meta: { type: mongoose.Schema.Types.Mixed, default: {} } // données annexes
}, {
  timestamps: true
});

// Index pour récupérer vite les notifs d'un user triées par date
notificationSchema.index({ destinataire: 1, createdAt: -1 });

delete mongoose.models['Notification'];
module.exports = mongoose.model('Notification', notificationSchema);
