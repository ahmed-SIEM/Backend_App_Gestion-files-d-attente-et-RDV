const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Informations communes
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  
  telephone: {
    type: String,
    required: true
  },
  
  mot_de_passe: {
    type: String,
    required: true,
    minlength: 6
  },
  
  role: {
    type: String,
    enum: ['citoyen', 'admin_etablissement', 'agent', 'super_admin'],
    required: true
  },
  
  // Informations Citoyen
  cin: {
    type: String,
    sparse: true
  },
  
  prenom: {
    type: String,
    required: function() {
      return this.role === 'citoyen' || this.role === 'agent' || this.role === 'super_admin';
    }
  },
  
  nom: {
    type: String,
    required: function() {
      return this.role === 'citoyen' || this.role === 'agent' || this.role === 'super_admin';
    }
  },
  
  adresse: String,
  gouvernorat: String,
  
  // Informations Admin Établissement
  nom_complet: {
    type: String,
    required: function() {
      return this.role === 'admin_etablissement';
    }
  },
  
  fonction: String,
  
  etablissement_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etablissement'
  },
  
  // Informations Agent
  service_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  
  numero_guichet: Number,
  
  statut: {
    type: String,
    enum: ['actif', 'inactif', 'suspendu', 'en_attente'],
    default: 'actif'
  },
  
  derniere_connexion: Date,

  // Reset Password
  reset_password_token: {
    type: String
  },
  
  reset_password_expire: {
    type: Date
  },

  // Email Verification
  verification_code: {
    type: String
  },
  
  verification_code_expire: {
    type: Date
  },
  
  email_verified: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// ⭐ CORRECTION - Hash le mot de passe avant de sauvegarder
userSchema.pre('save', async function() {
  // ⭐ PAS DE next() avec Mongoose 8+
  if (!this.isModified('mot_de_passe')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.mot_de_passe = await bcrypt.hash(this.mot_de_passe, salt);
});

// Méthode pour vérifier le mot de passe
userSchema.methods.verifierMotDePasse = async function(motDePasse) {
  return await bcrypt.compare(motDePasse, this.mot_de_passe);
};

// Ne pas renvoyer le mot de passe dans les réponses
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.mot_de_passe;
  delete obj.reset_password_token;
  delete obj.reset_password_expire;
  delete obj.verification_code;
  delete obj.verification_code_expire;
  return obj;
};

// ⭐ Évite l'erreur OverwriteModelError
module.exports = mongoose.models.User || mongoose.model('User', userSchema);