const mongoose = require('mongoose');

const etablissementSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true
  },
  
  type: {
    type: String,
    enum: ['mairie', 'hopital', 'cnam', 'poste', 'banque', 'autre'],
    required: true
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
  telephone: {
    type: String,
    required: true
  },
  
  email: {
    type: String,
    required: true
  },
  
  site_web: String,
  
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
    required: true
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

module.exports = mongoose.model('Etablissement', etablissementSchema);