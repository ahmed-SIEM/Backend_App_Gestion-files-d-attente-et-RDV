const jwt = require('jsonwebtoken');
const User = require('../models/User.model'); // ⭐ Import direct avec U majuscule

// Vérifier le token JWT
const verifierToken = async (req, res, next) => {
  try {
    // Récupérer le token depuis le header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Accès refusé. Token manquant.' 
      });
    }
    
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ⭐ CORRECTION : decoded.userId au lieu de decoded.id
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Utilisateur non trouvé.' 
      });
    }
    
    // Vérifier si l'utilisateur est actif
    if (user.statut !== 'actif') {
      return res.status(403).json({ 
        success: false,
        message: 'Compte inactif ou suspendu.' 
      });
    }
    
    // Ajouter l'user à la requête
    req.user = user;
    next();
    
  } catch (error) {
    console.error('Erreur auth middleware:', error);
    
    // Messages d'erreur plus précis
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token invalide.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expiré. Veuillez vous reconnecter.' 
      });
    }
    
    res.status(401).json({ 
      success: false,
      message: 'Erreur d\'authentification.' 
    });
  }
};

// Vérifier le rôle
const verifierRole = (...rolesAutorises) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Utilisateur non authentifié.' 
      });
    }
    
    if (!rolesAutorises.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Accès interdit. Permissions insuffisantes.' 
      });
    }
    
    next();
  };
};

module.exports = { verifierToken, verifierRole };