const mongoose = require('mongoose');

const etablissementSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true
  },
  
  type: {
    type: String,
    required: true,
    trim: true
  },
  
  description: {
    type: String
  },
  
  // Adresse
  adresse: {
    type: String,
    required: true
  },
  
  ville: {
    type: String,
    required: true
  },
  
  code_postal: String,
  
  gouvernorat: {
    type: String,
    required: true
  },
  
  // Contact
  telephone_etablissement: {
    type: String,
    required: true
  },
  
  email_etablissement: {
    type: String,
    required: true
  },
  
  site_web: String,
  
  // ⭐ HORAIRES D'OUVERTURE (Configurables par l'admin)
  horaires: {
    lundi: {
      ouvert: { type: Boolean, default: true },
      ouverture: { type: String, default: '08:00' },
      fermeture: { type: String, default: '17:00' }
    },
    mardi: {
      ouvert: { type: Boolean, default: true },
      ouverture: { type: String, default: '08:00' },
      fermeture: { type: String, default: '17:00' }
    },
    mercredi: {
      ouvert: { type: Boolean, default: true },
      ouverture: { type: String, default: '08:00' },
      fermeture: { type: String, default: '17:00' }
    },
    jeudi: {
      ouvert: { type: Boolean, default: true },
      ouverture: { type: String, default: '08:00' },
      fermeture: { type: String, default: '17:00' }
    },
    vendredi: {
      ouvert: { type: Boolean, default: true },
      ouverture: { type: String, default: '08:00' },
      fermeture: { type: String, default: '17:00' }
    },
    samedi: {
      ouvert: { type: Boolean, default: true },
      ouverture: { type: String, default: '08:00' },
      fermeture: { type: String, default: '13:00' }
    },
    dimanche: {
      ouvert: { type: Boolean, default: false },
      ouverture: { type: String, default: '00:00' },
      fermeture: { type: String, default: '00:00' }
    }
  },
  
  // Statut
  statut: {
    type: String,
    enum: ['en_attente', 'actif', 'suspendu', 'rejete'],
    default: 'en_attente'
  },
  
  raison_rejet: String,
  
  date_validation: Date,
  
  // Admin qui a créé
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Documents justificatifs
  documents: [{
    nom: String,
    type: String,
    url: String,
    date_upload: Date
  }]

}, {
  timestamps: true
});

module.exports = mongoose.models.Etablissement || mongoose.model('Etablissement', etablissementSchema);