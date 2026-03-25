const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model');
const Etablissement = require('../models/Etablissement.model');

// ============================================
// INSCRIPTION CITOYEN
// ============================================
exports.inscrireCitoyen = async (req, res) => {
  try {
    const { prenom, nom, email, mot_de_passe, telephone, cin } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const utilisateurExistant = await User.findOne({ email });
    if (utilisateurExistant) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé'
      });
    }

    // Créer l'utilisateur
    const user = await User.create({
      prenom,
      nom,
      email,
      mot_de_passe, // Le pre-save hook va le hasher
      telephone,
      cin,
      role: 'citoyen',
      statut: 'actif'
    });

    // Générer le token JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Retourner l'utilisateur sans le mot de passe
    const userResponse = user.toObject();
    delete userResponse.mot_de_passe;

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('Erreur inscription citoyen:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// INSCRIPTION ÉTABLISSEMENT
// ============================================
exports.inscrireEtablissement = async (req, res) => {
  try {
    console.log('📦 Données reçues:', req.body);
    const {
      // Infos établissement
      nom,
      type,
      gouvernorat,
      adresse,
      telephone_etablissement,
      email_etablissement,
      // Infos admin
      admin_prenom,
      admin_nom,
      admin_email,
      admin_telephone,
      admin_fonction,
      admin_mot_de_passe
    } = req.body;

    // Vérifier si l'email admin existe déjà
    const existingUser = await User.findOne({ email: admin_email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Un utilisateur avec cet email existe déjà'
      });
    }

    // Vérifier si l'établissement existe déjà
    const existingEtab = await Etablissement.findOne({ email_etablissement });
    if (existingEtab) {
      return res.status(400).json({
        success: false,
        message: 'Un établissement avec cet email existe déjà'
      });
    }

    // ⭐ CORRECTION - Créer l'utilisateur admin avec nom_complet
    const admin = await User.create({
      nom_complet: `${admin_prenom} ${admin_nom}`, // ⭐ nom_complet au lieu de prenom/nom
      email: admin_email,
      mot_de_passe: admin_mot_de_passe, // Le pre-save hook va le hasher
      telephone: admin_telephone,
      role: 'admin_etablissement',
      statut: 'en_attente' // En attente de validation
    });

    // Créer l'établissement
    const etablissement = await Etablissement.create({
      nom,
      type,
      gouvernorat,
      adresse,
      telephone_etablissement,
      email_etablissement,
      admin_prenom,
      admin_nom,
      admin_email,
      admin_telephone,
      admin_fonction,
      admin_id: admin._id,
      statut: 'en_attente' // En attente de validation super-admin
    });

    // Mettre à jour l'admin avec l'ID établissement
    admin.etablissement_id = etablissement._id;
    await admin.save();

    res.status(201).json({
      success: true,
      message: 'Demande d\'inscription envoyée avec succès. En attente de validation.'
    });

  } catch (error) {
    console.error('Erreur inscription établissement:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// CONNEXION
// ============================================
exports.connexion = async (req, res) => {
  try {
    const { email, mot_de_passe, remember_me } = req.body;

    // Trouver l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier le mot de passe
    const isMatch = await user.verifierMotDePasse(mot_de_passe);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier le statut
    if (user.statut !== 'actif') {
      return res.status(403).json({
        success: false,
        message: 'Votre compte est en attente de validation ou a été suspendu'
      });
    }

    // ⭐ Durée du token selon "Se souvenir de moi"
    const tokenExpiry = remember_me ? '7d' : '12h';

    // Générer le token JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        etablissement_id: user.etablissement_id
      },
      process.env.JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    // Mettre à jour dernière connexion
    user.derniere_connexion = new Date();
    await user.save();

    // Retourner l'utilisateur sans le mot de passe
    const userResponse = user.toObject();
    delete userResponse.mot_de_passe;

    res.json({
      success: true,
      message: 'Connexion réussie',
      data: {
        user: userResponse,
        token,
        remember_me
      }
    });

  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================
// MON PROFIL
// ============================================
exports.monProfil = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-mot_de_passe');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Erreur mon profil:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};