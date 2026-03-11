const mongoose = require('mongoose');

const creneauSchema = new mongoose.Schema({
  calendrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Calendrier',
    required: true
  },
  
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  
  date: {
    type: Date,
    required: true
  },
  
  heure_debut: {
    type: String, // Format "HH:mm"
    required: true
  },
  
  heure_fin: {
    type: String, // Format "HH:mm"
    required: true
  },
  
  duree_minutes: {
    type: Number,
    default: 30
  },
  
  statut: {
    type: String,
    enum: ['libre', 'occupe', 'bloque'],
    default: 'libre'
  }

}, {
  timestamps: true
});

// Index pour recherche rapide
creneauSchema.index({ calendrier: 1, date: 1 });
creneauSchema.index({ service: 1, date: 1, statut: 1 });

module.exports = mongoose.model('Creneau', creneauSchema);