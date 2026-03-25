const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifierToken } = require('../middlewares/auth.middleware');
const crypto = require('crypto');
const User = require('../models/User.model'); // ⭐ U majuscule
const { sendResetPasswordEmail } = require('../utils/email');

// ============================================
// ROUTES PUBLIQUES
// ============================================

// Signup & Login
router.post('/signup/citoyen', authController.inscrireCitoyen);
router.post('/signup/etablissement', authController.inscrireEtablissement);
router.post('/login', authController.connexion);

// ============================================
// MOT DE PASSE OUBLIÉ
// ============================================

// Demander réinitialisation mot de passe
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      // Pour la sécurité, on ne dit pas si l'email existe ou non
      return res.json({
        success: true,
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
      });
    }

    // Générer token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Sauvegarder le token et expiration (1 heure)
    user.reset_password_token = hashedToken;
    user.reset_password_expire = Date.now() + 60 * 60 * 1000; // 1 heure
    await user.save();

    // Créer l'URL de réinitialisation
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Envoyer l'email
    await sendResetPasswordEmail(user.email, resetUrl, user.prenom || user.nom_complet || user.nom);

    res.json({
      success: true,
      message: 'Email de réinitialisation envoyé avec succès'
    });

  } catch (error) {
    console.error('Erreur forgot password:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Réinitialiser mot de passe
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { mot_de_passe } = req.body;

    // Hasher le token pour comparaison
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Trouver l'utilisateur avec le token valide
    const user = await User.findOne({
      reset_password_token: hashedToken,
      reset_password_expire: { $gt: Date.now() } // Token pas expiré
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }

    // Mettre à jour le mot de passe et supprimer le token
    user.mot_de_passe = mot_de_passe; // Le pre-save hook va le hasher
    user.reset_password_token = undefined;
    user.reset_password_expire = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    console.error('Erreur reset password:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// ROUTES PROTÉGÉES
// ============================================

// Mon profil
router.get('/me', verifierToken, authController.monProfil);

// Mettre à jour profil
router.put('/profile', verifierToken, async (req, res) => {
  try {
    const { prenom, nom, email, telephone } = req.body;
    
    // Vérifier si l'email est déjà utilisé par un autre utilisateur
    if (email !== req.user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cet email est déjà utilisé' 
        });
      }
    }
    
    // Mettre à jour
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { prenom, nom, email, telephone },
      { new: true, runValidators: true }
    ).select('-mot_de_passe');
    
    res.json({ 
      success: true, 
      data: updatedUser 
    });
    
  } catch (error) {
    console.error('Erreur update profile:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Changer mot de passe
router.put('/change-password', verifierToken, async (req, res) => {
  try {
    const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;
    
    // Récupérer l'utilisateur avec le mot de passe
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé' 
      });
    }
    
    // Vérifier l'ancien mot de passe
    const isMatch = await user.verifierMotDePasse(ancien_mot_de_passe);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mot de passe actuel incorrect' 
      });
    }
    
    // Mettre à jour le mot de passe
    user.mot_de_passe = nouveau_mot_de_passe; // Le pre-save hook va le hasher
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Mot de passe modifié avec succès' 
    });
    
  } catch (error) {
    console.error('Erreur change password:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;