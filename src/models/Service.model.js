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
  },

  // ===== CONFIGURATION RENDEZ-VOUS =====
  // L'admin configure une fois, les créneaux se génèrent automatiquement
  config_rdv: {
    duree_creneau: { type: Number, default: 30 }, // minutes par créneau
    jours: {
      type: [String],
      enum: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
      default: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
    },
    heure_debut: { type: String, default: '08:00' },
    heure_fin: { type: String, default: '17:00' },
    pause_debut: { type: String, default: '' }, // ex: '12:00'
    pause_fin: { type: String, default: '' },   // ex: '13:00'
    // Exceptions : jours fériés, fermetures exceptionnelles, fin anticipée
    exceptions: [{
      date: { type: Date, required: true },          // date début
      date_fin: Date,                                 // date fin (si plage) — null = 1 seul jour
      type: {
        type: String,
        enum: ['ferme', 'horaire_modifie'],
        default: 'ferme'
      },
      heure_debut_exceptionnelle: String, // ouverture tardive  ex: '10:00'
      heure_fin_exceptionnelle: String,   // fermeture anticipée ex: '14:00'
      raison: String
    }]
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Service', serviceSchema);