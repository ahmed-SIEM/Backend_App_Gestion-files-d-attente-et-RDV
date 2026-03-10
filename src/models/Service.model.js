const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  etablissement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etablissement',
    required: true
  },
  
  nom: {
    type: String,
    required: true,
    trim: true
  },
  
  description: String,
  
  // Type de service
  file_activee: {
    type: Boolean,
    default: false
  },
  
  rdv_active: {
    type: Boolean,
    default: false
  },
  
  // Pour File d'attente
  temps_traitement_moyen: {
    type: Number, // en minutes
    default: 15
  },
  
  nombre_guichets: {
    type: Number,
    default: 1
  },
  
  // Statut
  statut: {
    type: String,
    enum: ['actif', 'inactif'],
    default: 'actif'
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Service', serviceSchema);