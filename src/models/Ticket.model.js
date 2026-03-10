const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  numero: {
    type: Number,
    required: true
  },
  
  citoyen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
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
  
  position: {
    type: Number,
    required: true
  },
  
  statut: {
    type: String,
    enum: ['en_attente', 'appele', 'en_cours', 'servi', 'annule', 'no_show'],
    default: 'en_attente'
  },
  
  // Timestamps spécifiques
  heure_creation: {
    type: Date,
    default: Date.now
  },
  
  heure_appel: Date,
  heure_service: Date,
  
  // Agent qui traite
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  guichet: Number,
  
  // Temps d'attente calculé
  temps_attente_minutes: Number

}, {
  timestamps: true
});

// Index pour recherche rapide
ticketSchema.index({ service: 1, statut: 1, position: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);