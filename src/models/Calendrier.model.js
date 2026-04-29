const mongoose = require('mongoose');

const calendrierSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  
  nom: {
    type: String,
    default: 'Calendrier principal'
  },
  
  description: String,
  
  // Configuration globale
  duree_rdv_defaut: {
    type: Number, // en minutes
    default: 30
  },
  
  intervalle_creneaux: {
    type: Number, // en minutes
    default: 5
  },
  
  statut: {
    type: String,
    enum: ['actif', 'inactif'],
    default: 'actif'
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Calendrier', calendrierSchema);