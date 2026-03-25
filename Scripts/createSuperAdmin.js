const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Se connecter à MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => {
    console.error('❌ Erreur MongoDB:', err);
    process.exit(1);
  });

// Import du modèle User
const User = require('../src/models/User.model');

const createSuperAdmin = async () => {
  try {
    // Vérifier si un super admin existe déjà
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    
    if (existingSuperAdmin) {
      console.log('⚠️  Un super admin existe déjà !');
      console.log('Email:', existingSuperAdmin.email);
      process.exit(0);
    }

    // Créer le super admin
    const superAdmin = await User.create({
      prenom: 'Super',
      nom: 'Admin',
      email: 'superadmin@filezen.tn',
      mot_de_passe: 'SuperAdmin123!', // ⭐ Change ce mot de passe !
      telephone: '+216 12 345 678',
      role: 'super_admin',
      statut: 'actif',
      email_verified: true
    });

    console.log('✅ Super Admin créé avec succès !');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email:', superAdmin.email);
    console.log('Mot de passe: SuperAdmin123!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  CHANGE LE MOT DE PASSE APRÈS LA PREMIÈRE CONNEXION !');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur lors de la création du super admin:', error);
    process.exit(1);
  }
};

createSuperAdmin();