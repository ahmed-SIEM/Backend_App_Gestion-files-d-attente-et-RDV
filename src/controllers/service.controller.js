const { Service, Etablissement, FileAttente } = require('../models');

// LISTE SERVICES D'UN ÉTABLISSEMENT (public)
exports.listerServices = async (req, res) => {
  try {
    const services = await Service.find({ 
      etablissement: req.params.etablissementId,
      statut: 'actif'
    }).sort({ nom: 1 });
    
    res.json({
      success: true,
      count: services.length,
      data: services
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des services.',
      error: error.message 
    });
  }
};

// DÉTAILS D'UN SERVICE
exports.detailsService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('etablissement', 'nom type ville');
    
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      data: service
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du service.',
      error: error.message 
    });
  }
};

// ===== ROUTES ADMIN ÉTABLISSEMENT =====

// MES SERVICES
exports.mesServices = async (req, res) => {
  try {
    const services = await Service.find({ 
      etablissement: req.user.etablissement 
    }).sort({ nom: 1 });
    
    res.json({
      success: true,
      count: services.length,
      data: services
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des services.',
      error: error.message 
    });
  }
};

// CRÉER SERVICE
exports.creerService = async (req, res) => {
  try {
    const { 
      nom, 
      description, 
      file_activee, 
      rdv_active, 
      temps_traitement_moyen, 
      nombre_guichets 
    } = req.body;
    
    const service = await Service.create({
      etablissement: req.user.etablissement,
      nom,
      description,
      file_activee,
      rdv_active,
      temps_traitement_moyen,
      nombre_guichets
    });
    
    // Si file activée, créer une FileAttente
    if (file_activee) {
      await FileAttente.create({
        service: service._id
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Service créé avec succès !',
      data: service
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la création du service.',
      error: error.message 
    });
  }
};

// MODIFIER SERVICE
exports.modifierService = async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { 
        _id: req.params.id,
        etablissement: req.user.etablissement 
      },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      message: 'Service modifié avec succès !',
      data: service
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la modification.',
      error: error.message 
    });
  }
};

// SUPPRIMER SERVICE
exports.supprimerService = async (req, res) => {
  try {
    const service = await Service.findOneAndDelete({
      _id: req.params.id,
      etablissement: req.user.etablissement
    });
    
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service non trouvé.' 
      });
    }
    
    // Supprimer aussi la file d'attente si elle existe
    await FileAttente.findOneAndDelete({ service: service._id });
    
    res.json({
      success: true,
      message: 'Service supprimé avec succès !'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suppression.',
      error: error.message 
    });
  }
};

// ACTIVER/DÉSACTIVER SERVICE
exports.toggleService = async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      etablissement: req.user.etablissement
    });
    
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service non trouvé.' 
      });
    }
    
    service.statut = service.statut === 'actif' ? 'inactif' : 'actif';
    await service.save();
    
    res.json({
      success: true,
      message: `Service ${service.statut === 'actif' ? 'activé' : 'désactivé'} !`,
      data: service
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors du changement de statut.',
      error: error.message 
    });
  }
};