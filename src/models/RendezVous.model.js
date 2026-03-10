const mongoose = require('mongoose');

const rendezVousSchema = new mongoose.Schema({
  citoyen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Un RDV peut avoir PLUSIEURS créneaux (selon ton encadrant)
  creneaux: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Creneau',
    required: true
  }],
  
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  
  etablissement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etablissement',
    required: true
  },
  
  motif: String,
  
  statut: {
    type: String,
    enum: ['confirme', 'annule', 'en_cours', 'termine', 'no_show'],
    default: 'confirme'
  },
  
  // Historique
  date_annulation: Date,
  raison_annulation: String,
  
  // Rappels
  rappels_actives: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('RendezVous', rendezVousSchema);