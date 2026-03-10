const jwt = require('jsonwebtoken');
const { User } = require('../models');

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
    
    // Trouver l'utilisateur
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Utilisateur non trouvé.' 
      });
    }
    
    // Ajouter l'user à la requête
    req.user = user;
    next();
    
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: 'Token invalide.' 
    });
  }
};

// Vérifier le rôle
const verifierRole = (...rolesAutorises) => {
  return (req, res, next) => {
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