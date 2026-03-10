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
    sparse: true // Unique seulement si présent
  },
  
  prenom: {
    type: String,
    required: function() {
      return this.role === 'citoyen' || this.role === 'agent';
    }
  },
  
  nom: {
    type: String,
    required: function() {
      return this.role === 'citoyen' || this.role === 'agent';
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
  
  etablissement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etablissement',
    required: function() {
      return this.role === 'admin_etablissement' || this.role === 'agent';
    }
  },
  
  // Informations Agent
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  
  numero_guichet: Number,
  
  statut: {
    type: String,
    enum: ['actif', 'inactif', 'suspendu'],
    default: 'actif'
  },
  
  derniere_connexion: Date

}, {
  timestamps: true // Ajoute createdAt et updatedAt automatiquement
});

// Hash le mot de passe avant de sauvegarder
userSchema.pre('save', async function(next) {
  if (!this.isModified('mot_de_passe')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.mot_de_passe = await bcrypt.hash(this.mot_de_passe, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour vérifier le mot de passe
userSchema.methods.verifierMotDePasse = async function(motDePasse) {
  return await bcrypt.compare(motDePasse, this.mot_de_passe);
};

// Ne pas renvoyer le mot de passe dans les réponses
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.mot_de_passe;
  return obj;
};

module.exports = mongoose.model('User', userSchema);