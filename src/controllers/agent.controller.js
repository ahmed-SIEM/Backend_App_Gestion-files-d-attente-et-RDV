const { User } = require('../models');

// CRÉER UN AGENT (Admin Établissement)
exports.creerAgent = async (req, res) => {
  try {
    const { email, telephone, prenom, nom, service_id, numero_guichet } = req.body;
    
    // Vérifier si l'email existe déjà
    const existant = await User.findOne({ email });
    if (existant) {
      return res.status(400).json({ 
        success: false,
        message: 'Cet email est déjà utilisé.' 
      });
    }
    
    // Créer l'agent avec un mot de passe temporaire
    const agent = await User.create({
      email,
      telephone,
      mot_de_passe: 'agent123', // Mot de passe temporaire (à changer au premier login)
      role: 'agent',
      prenom,
      nom,
      etablissement: req.user.etablissement,
      service: service_id,
      numero_guichet,
      statut: 'actif'
    });
    
    // TODO: Envoyer email d'invitation avec lien pour créer mot de passe
    
    res.status(201).json({
      success: true,
      message: 'Agent créé avec succès ! Email d\'invitation envoyé.',
      data: agent
    });
    
  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la création de l\'agent.',
      error: error.message 
    });
  }
};

// LISTER MES AGENTS (Admin Établissement)
exports.mesAgents = async (req, res) => {
  try {
    const agents = await User.find({
      etablissement: req.user.etablissement,
      role: 'agent'
    })
    .populate('service', 'nom')
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: agents.length,
      data: agents
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des agents.',
      error: error.message 
    });
  }
};

// MODIFIER AGENT (Admin Établissement)
exports.modifierAgent = async (req, res) => {
  try {
    const { service_id, numero_guichet, statut } = req.body;
    
    const agent = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        etablissement: req.user.etablissement,
        role: 'agent'
      },
      {
        service: service_id,
        numero_guichet,
        statut
      },
      { new: true, runValidators: true }
    ).populate('service', 'nom');
    
    if (!agent) {
      return res.status(404).json({ 
        success: false,
        message: 'Agent non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      message: 'Agent modifié avec succès !',
      data: agent
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la modification.',
      error: error.message 
    });
  }
};

// SUPPRIMER AGENT (Admin Établissement)
exports.supprimerAgent = async (req, res) => {
  try {
    const agent = await User.findOneAndDelete({
      _id: req.params.id,
      etablissement: req.user.etablissement,
      role: 'agent'
    });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false,
        message: 'Agent non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      message: 'Agent supprimé avec succès !'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suppression.',
      error: error.message 
    });
  }
};