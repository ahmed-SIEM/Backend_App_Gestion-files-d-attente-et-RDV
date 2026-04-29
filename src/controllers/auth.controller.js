const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model');
const Etablissement = require('../models/Etablissement.model');
const { sendVerificationCodeEmail } = require('../utils/email');

function genererCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

    const code = genererCode();
    const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Créer l'utilisateur — statut inactif jusqu'à vérification
    const user = await User.create({
      prenom,
      nom,
      email,
      mot_de_passe,
      telephone,
      cin,
      role: 'citoyen',
      statut: 'inactif',
      verification_code: code,
      verification_code_expire: expiration,
      email_verified: false
    });

    // Envoyer le code par email
    await sendVerificationCodeEmail(email, code, prenom);

    res.status(201).json({
      success: true,
      message: 'Compte créé ! Vérifiez votre email pour activer votre compte.',
      data: { userId: user._id, email }
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
      nom_etablissement,
      type,
      description,
      gouvernorat,
      adresse,
      ville,
      code_postal,
      telephone_etablissement,
      email_etablissement,
      // ⭐ CORRECTION - Les vrais noms envoyés par le frontend
      nom_complet,
      fonction,
      email_admin,        // ⭐ PAS admin_email
      telephone_admin,    // ⭐ PAS admin_telephone
      mot_de_passe,       // ⭐ PAS admin_mot_de_passe
      documents
    } = req.body;

    console.log('👤 Admin email:', email_admin);
    console.log('📱 Admin téléphone:', telephone_admin);
    console.log('🔑 Admin mot de passe:', mot_de_passe ? '✅ Présent' : '❌ Manquant');

    // Vérifier si l'email admin existe déjà
    const existingUser = await User.findOne({ email: email_admin });
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

    const code = genererCode();
    const expiration = new Date(Date.now() + 10 * 60 * 1000);

    // ⭐ Créer l'utilisateur admin — email non vérifié
    const admin = await User.create({
      nom_complet,
      email: email_admin,
      mot_de_passe,
      telephone: telephone_admin,
      role: 'admin_etablissement',
      statut: 'en_attente',
      verification_code: code,
      verification_code_expire: expiration,
      email_verified: false
    });

    console.log('✅ Admin créé:', admin._id);

    // Formater les documents
    let rawDocs = documents;
    // Si c'est une string, essayer de parser (cas FormData ou double-encode)
    if (typeof rawDocs === 'string') {
      try { rawDocs = JSON.parse(rawDocs); } catch { rawDocs = []; }
    }
    // Si c'est un array dont le premier élément est une string, parser cet élément
    if (Array.isArray(rawDocs) && rawDocs.length > 0 && typeof rawDocs[0] === 'string') {
      try { rawDocs = JSON.parse(rawDocs[0]); } catch { rawDocs = []; }
    }
    if (!Array.isArray(rawDocs)) rawDocs = [];

    const documentsFormates = rawDocs
      .filter(doc => doc && typeof doc === 'object')
      .map(doc => ({
        nom: doc.nom || doc.name || '',
        type: doc.type || 'document',
        url: doc.url || '',
        date_upload: new Date()
      }));

    // Créer l'établissement
    const etablissement = await Etablissement.create({
      nom: nom || nom_etablissement,
      type,
      description,
      gouvernorat,
      adresse,
      ville,
      code_postal,
      telephone_etablissement,
      email_etablissement,
      admin: admin._id,
      statut: 'en_attente',
      documents: documentsFormates
    });

    console.log('✅ Établissement créé:', etablissement._id);

    // Mettre à jour l'admin avec l'ID établissement
    admin.etablissement_id = etablissement._id;
    await admin.save();

    console.log('✅ Admin mis à jour avec établissement_id');

    // Envoyer code de vérification à l'admin
    await sendVerificationCodeEmail(email_admin, code, nom_complet);

    res.status(201).json({
      success: true,
      message: 'Demande envoyée ! Vérifiez votre email pour confirmer votre adresse.',
      data: { userId: admin._id, email: email_admin }
    });

  } catch (error) {
    console.error('❌ Erreur inscription établissement:', error);
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

    // Vérifier email vérifié
    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Veuillez vérifier votre email avant de vous connecter.',
        code: 'EMAIL_NOT_VERIFIED',
        userId: user._id
      });
    }

    // Vérifier le statut
    if (user.statut !== 'actif') {
      return res.status(403).json({
        success: false,
        message: 'Votre compte est en attente de validation ou a été suspendu'
      });
    }

    // Durée du token selon "Se souvenir de moi"
    const tokenExpiry = remember_me ? '30d' : '1d';

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
// VÉRIFICATION EMAIL
// ============================================
exports.verifierEmail = async (req, res) => {
  try {
    const { userId, code } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
    }

    if (user.email_verified) {
      return res.status(400).json({ success: false, message: 'Email déjà vérifié.' });
    }

    if (!user.verification_code || user.verification_code !== code) {
      return res.status(400).json({ success: false, message: 'Code incorrect.' });
    }

    if (new Date() > user.verification_code_expire) {
      return res.status(400).json({
        success: false,
        message: 'Code expiré. Demandez un nouveau code.',
        code: 'CODE_EXPIRED'
      });
    }

    // Activer le compte citoyen, laisser en_attente pour admin_etablissement
    const nouveauStatut = user.role === 'citoyen' ? 'actif' : user.statut;

    await User.findByIdAndUpdate(userId, {
      email_verified: true,
      statut: nouveauStatut,
      verification_code: null,
      verification_code_expire: null
    });

    // Si citoyen → générer token et connecter directement
    if (user.role === 'citoyen') {
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      const userResponse = user.toObject();
      delete userResponse.mot_de_passe;
      userResponse.statut = 'actif';
      userResponse.email_verified = true;

      return res.json({
        success: true,
        message: 'Email vérifié ! Bienvenue sur FileZen.',
        data: { user: userResponse, token }
      });
    }

    // Si admin_etablissement → juste confirmer, pas de connexion auto
    res.json({
      success: true,
      message: 'Email vérifié ! Votre demande est en cours d\'examen par notre équipe.'
    });

  } catch (error) {
    console.error('Erreur vérification email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// RENVOYER CODE DE VÉRIFICATION
// ============================================
exports.renvoyerCode = async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
    }

    if (user.email_verified) {
      return res.status(400).json({ success: false, message: 'Email déjà vérifié.' });
    }

    const code = genererCode();
    const expiration = new Date(Date.now() + 10 * 60 * 1000);

    await User.findByIdAndUpdate(userId, {
      verification_code: code,
      verification_code_expire: expiration
    });

    const prenom = user.prenom || user.nom_complet || 'Utilisateur';
    await sendVerificationCodeEmail(user.email, code, prenom);

    res.json({ success: true, message: 'Nouveau code envoyé !' });

  } catch (error) {
    console.error('Erreur renvoi code:', error);
    res.status(500).json({ success: false, message: error.message });
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