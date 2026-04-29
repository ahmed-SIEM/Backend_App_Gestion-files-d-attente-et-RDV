const mongoose = require('mongoose');

const rendezVousSchema = new mongoose.Schema({
  // Null si RDV créé manuellement par un agent (appel téléphonique)
  citoyen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // RDV téléphonique : infos patient sans compte
  nom_patient: String,
  telephone_patient: String,
  cree_par_agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  },
  rappel_24h_envoye: {
    type: Boolean,
    default: false
  },
  rappel_1h_envoye: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('RendezVous', rendezVousSchema);