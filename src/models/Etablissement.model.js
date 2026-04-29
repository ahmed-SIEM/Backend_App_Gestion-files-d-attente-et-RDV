const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  nom: String,
  type: String,
  url: String,
  date_upload: Date
}, { _id: false });

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
  
  // Photo / logo
  photo: {
    type: String,
    default: null
  },

  // Documents justificatifs
  documents: [documentSchema],

  // Signalements citoyens
  signalements: [{
    citoyen: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    raison: {
      type: String,
      enum: ['service_mediocre', 'attente_excessive', 'comportement_irrespectueux', 'informations_incorrectes', 'ferme_sans_prevenir', 'autre'],
      required: true
    },
    commentaire: String,
    date: { type: Date, default: Date.now },
    traite: { type: Boolean, default: false }
  }],

  // Compteur rapide + alerte super admin
  nb_signalements: { type: Number, default: 0 },
  alerte_signalement_envoyee: { type: Boolean, default: false }

}, {
  timestamps: true
});

// Supprimer le modèle en cache pour éviter l'erreur "OverwriteModelError" avec nodemon
delete mongoose.models['Etablissement'];
module.exports = mongoose.model('Etablissement', etablissementSchema);