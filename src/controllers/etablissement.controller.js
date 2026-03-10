const { Etablissement, User } = require('../models');

// LISTE TOUS LES ÉTABLISSEMENTS (pour citoyens - recherche)
exports.listerEtablissements = async (req, res) => {
  try {
    const { type, gouvernorat, search } = req.query;
    
    let filtres = { statut: 'actif' };
    
    if (type) filtres.type = type;
    if (gouvernorat) filtres.gouvernorat = gouvernorat;
    if (search) {
      filtres.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { ville: { $regex: search, $options: 'i' } }
      ];
    }
    
    const etablissements = await Etablissement.find(filtres)
      .populate('admin', 'nom_complet email telephone')
      .sort({ nom: 1 });
    
    res.json({
      success: true,
      count: etablissements.length,
      data: etablissements
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des établissements.',
      error: error.message 
    });
  }
};

// DÉTAILS D'UN ÉTABLISSEMENT
exports.detailsEtablissement = async (req, res) => {
  try {
    const etablissement = await Etablissement.findById(req.params.id)
      .populate('admin', 'nom_complet email telephone');
    
    if (!etablissement) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      data: etablissement
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération de l\'établissement.',
      error: error.message 
    });
  }
};

// MON ÉTABLISSEMENT (pour admin)
exports.monEtablissement = async (req, res) => {
  try {
    const etablissement = await Etablissement.findById(req.user.etablissement)
      .populate('admin', 'nom_complet email telephone');
    
    if (!etablissement) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      data: etablissement
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération de l\'établissement.',
      error: error.message 
    });
  }
};

// MODIFIER ÉTABLISSEMENT
exports.modifierEtablissement = async (req, res) => {
  try {
    const { nom, description, telephone, email, site_web } = req.body;
    
    const etablissement = await Etablissement.findByIdAndUpdate(
      req.user.etablissement,
      { nom, description, telephone, email, site_web },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Établissement modifié avec succès !',
      data: etablissement
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la modification.',
      error: error.message 
    });
  }
};

// ===== ROUTES SUPER-ADMIN =====

// LISTE DEMANDES EN ATTENTE
exports.demandesEnAttente = async (req, res) => {
  try {
    const demandes = await Etablissement.find({ statut: 'en_attente' })
      .populate('admin', 'nom_complet email telephone')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: demandes.length,
      data: demandes
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des demandes.',
      error: error.message 
    });
  }
};

// APPROUVER ÉTABLISSEMENT
exports.approuverEtablissement = async (req, res) => {
  try {
    const etablissement = await Etablissement.findByIdAndUpdate(
      req.params.id,
      { 
        statut: 'actif',
        date_validation: new Date()
      },
      { new: true }
    );
    
    if (!etablissement) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement non trouvé.' 
      });
    }
    
    // TODO: Envoyer email de confirmation à l'admin
    
    res.json({
      success: true,
      message: 'Établissement approuvé avec succès !',
      data: etablissement
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'approbation.',
      error: error.message 
    });
  }
};

// REJETER ÉTABLISSEMENT
exports.rejeterEtablissement = async (req, res) => {
  try {
    const { raison } = req.body;
    
    const etablissement = await Etablissement.findByIdAndUpdate(
      req.params.id,
      { 
        statut: 'rejete',
        raison_rejet: raison,
        date_validation: new Date()
      },
      { new: true }
    );
    
    if (!etablissement) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement non trouvé.' 
      });
    }
    
    // TODO: Envoyer email de rejet à l'admin
    
    res.json({
      success: true,
      message: 'Établissement rejeté.',
      data: etablissement
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors du rejet.',
      error: error.message 
    });
  }
};

// SUSPENDRE ÉTABLISSEMENT
exports.suspendreEtablissement = async (req, res) => {
  try {
    const { raison } = req.body;
    
    const etablissement = await Etablissement.findByIdAndUpdate(
      req.params.id,
      { 
        statut: 'suspendu',
        raison_rejet: raison
      },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Établissement suspendu.',
      data: etablissement
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suspension.',
      error: error.message 
    });
  }
};

// SUPPRIMER ÉTABLISSEMENT
exports.supprimerEtablissement = async (req, res) => {
  try {
    await Etablissement.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Établissement supprimé définitivement.'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suppression.',
      error: error.message 
    });
  }
};