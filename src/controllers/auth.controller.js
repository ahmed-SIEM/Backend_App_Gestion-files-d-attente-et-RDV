const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Générer un token JWT
const genererToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d' // Token valide 7 jours
  });
};

// INSCRIPTION CITOYEN
exports.inscrireCitoyen = async (req, res) => {
  try {
    const { email, telephone, mot_de_passe, cin, prenom, nom, adresse, gouvernorat } = req.body;
    
    // Vérifier si l'email existe déjà
    const existant = await User.findOne({ email });
    if (existant) {
      return res.status(400).json({ 
        success: false,
        message: 'Cet email est déjà utilisé.' 
      });
    }
    
    // Créer le citoyen
    const citoyen = await User.create({
      email,
      telephone,
      mot_de_passe,
      role: 'citoyen',
      cin,
      prenom,
      nom,
      adresse,
      gouvernorat
    });
    
    // Générer le token
    const token = genererToken(citoyen._id);
    
    res.status(201).json({
      success: true,
      message: 'Compte citoyen créé avec succès !',
      data: {
        user: citoyen,
        token
      }
    });
    
  } catch (error) {
    console.error('Erreur inscription citoyen:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'inscription.',
      error: error.message 
    });
  }
};

// INSCRIPTION ÉTABLISSEMENT
exports.inscrireEtablissement = async (req, res) => {
  try {
    const { 
      // Établissement
      nom_etablissement, type, description, adresse, ville, code_postal, 
      gouvernorat, telephone_etablissement, email_etablissement, site_web,
      // Admin
      nom_complet, fonction, email_admin, telephone_admin, mot_de_passe,
      // Documents
      documents
    } = req.body;
    
    // Vérifier si l'email admin existe déjà
    const existant = await User.findOne({ email: email_admin });
    if (existant) {
      return res.status(400).json({ 
        success: false,
        message: 'Cet email est déjà utilisé.' 
      });
    }
    
    const { Etablissement } = require('../models');
    
    // Créer l'établissement
    const etablissement = await Etablissement.create({
      nom: nom_etablissement,
      type,
      description,
      adresse,
      ville,
      code_postal,
      gouvernorat,
      telephone: telephone_etablissement,
      email: email_etablissement,
      site_web,
      documents: documents || [],
      statut: 'en_attente'
    });
    
    // Créer l'admin
    const admin = await User.create({
      email: email_admin,
      telephone: telephone_admin,
      mot_de_passe,
      role: 'admin_etablissement',
      nom_complet,
      fonction,
      etablissement: etablissement._id
    });
    
    // Mettre à jour l'établissement avec l'admin
    etablissement.admin = admin._id;
    await etablissement.save();
    
    res.status(201).json({
      success: true,
      message: 'Demande d\'inscription envoyée ! Vous recevrez un email une fois validée.',
      data: {
        etablissement,
        admin
      }
    });
    
  } catch (error) {
    console.error('Erreur inscription établissement:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'inscription.',
      error: error.message 
    });
  }
};

// CONNEXION
exports.connexion = async (req, res) => {
  try {
    const { email, mot_de_passe } = req.body;
    
    // Trouver l'utilisateur
    const user = await User.findOne({ email }).populate('etablissement');
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Email ou mot de passe incorrect.' 
      });
    }
    
    // Vérifier le mot de passe
    const motDePasseValide = await user.verifierMotDePasse(mot_de_passe);
    
    if (!motDePasseValide) {
      return res.status(401).json({ 
        success: false,
        message: 'Email ou mot de passe incorrect.' 
      });
    }
    
    // Vérifier statut établissement pour admin/agent
    if (user.role === 'admin_etablissement' || user.role === 'agent') {
      if (user.etablissement?.statut === 'en_attente') {
        return res.status(403).json({ 
          success: false,
          message: 'Votre établissement est en attente de validation.' 
        });
      }
      if (user.etablissement?.statut === 'suspendu') {
        return res.status(403).json({ 
          success: false,
          message: 'Votre établissement est suspendu.' 
        });
      }
      if (user.etablissement?.statut === 'rejete') {
        return res.status(403).json({ 
          success: false,
          message: 'Votre demande d\'inscription a été rejetée.' 
        });
      }
    }
    
    // Mettre à jour dernière connexion
    user.derniere_connexion = new Date();
    await user.save();
    
    // Générer le token
    const token = genererToken(user._id);
    
    res.json({
      success: true,
      message: 'Connexion réussie !',
      data: {
        user,
        token
      }
    });
    
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la connexion.',
      error: error.message 
    });
  }
};

// MON PROFIL
exports.monProfil = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('etablissement')
      .populate('service');
    
    res.json({
      success: true,
      data: user
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du profil.',
      error: error.message 
    });
  }
};