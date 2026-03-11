const { Creneau, Calendrier, Service } = require('../models');

// ===== ROUTES AGENT =====

// MON CALENDRIER
exports.monCalendrier = async (req, res) => {
  try {
    if (!req.user.service) {
      return res.status(400).json({ 
        success: false,
        message: 'Aucun service assigné.' 
      });
    }
    
    let calendrier = await Calendrier.findOne({
      agent: req.user._id,
      service: req.user.service
    });
    
    // Créer le calendrier s'il n'existe pas
    if (!calendrier) {
      calendrier = await Calendrier.create({
        agent: req.user._id,
        service: req.user.service,
        nom: 'Calendrier principal'
      });
    }
    
    res.json({
      success: true,
      data: calendrier
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du calendrier.',
      error: error.message 
    });
  }
};

// MES CRÉNEAUX
exports.mesCreneaux = async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    
    const calendrier = await Calendrier.findOne({
      agent: req.user._id,
      service: req.user.service
    });
    
    if (!calendrier) {
      return res.json({
        success: true,
        count: 0,
        data: []
      });
    }
    
    let filtres = { calendrier: calendrier._id };
    
    if (date_debut && date_fin) {
      filtres.date = {
        $gte: new Date(date_debut),
        $lte: new Date(date_fin)
      };
    }
    
    const creneaux = await Creneau.find(filtres)
      .sort({ date: 1, heure_debut: 1 });
    
    res.json({
      success: true,
      count: creneaux.length,
      data: creneaux
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des créneaux.',
      error: error.message 
    });
  }
};

// AJOUTER CRÉNEAU
exports.ajouterCreneau = async (req, res) => {
  try {
    const { date, heure_debut, heure_fin, duree_minutes } = req.body;
    
    if (!req.user.service) {
      return res.status(400).json({ 
        success: false,
        message: 'Aucun service assigné.' 
      });
    }
    
    // Récupérer ou créer le calendrier
    let calendrier = await Calendrier.findOne({
      agent: req.user._id,
      service: req.user.service
    });
    
    if (!calendrier) {
      calendrier = await Calendrier.create({
        agent: req.user._id,
        service: req.user.service
      });
    }
    
    // Créer le créneau
    const creneau = await Creneau.create({
      calendrier: calendrier._id,
      service: req.user.service,
      date: new Date(date),
      heure_debut,
      heure_fin,
      duree_minutes: duree_minutes || calendrier.duree_rdv_defaut,
      statut: 'libre'
    });
    
    res.status(201).json({
      success: true,
      message: 'Créneau créé avec succès !',
      data: creneau
    });
    
  } catch (error) {
    console.error('Erreur création créneau:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la création du créneau.',
      error: error.message 
    });
  }
};

// BLOQUER CRÉNEAU
exports.bloquerCreneau = async (req, res) => {
  try {
    const creneau = await Creneau.findOne({
      _id: req.params.id,
      service: req.user.service,
      statut: 'libre'
    });
    
    if (!creneau) {
      return res.status(404).json({ 
        success: false,
        message: 'Créneau non trouvé ou non disponible.' 
      });
    }
    
    creneau.statut = 'bloque';
    await creneau.save();
    
    res.json({
      success: true,
      message: 'Créneau bloqué.',
      data: creneau
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors du blocage.',
      error: error.message 
    });
  }
};

// DÉBLOQUER CRÉNEAU
exports.debloquerCreneau = async (req, res) => {
  try {
    const creneau = await Creneau.findOne({
      _id: req.params.id,
      service: req.user.service,
      statut: 'bloque'
    });
    
    if (!creneau) {
      return res.status(404).json({ 
        success: false,
        message: 'Créneau non trouvé.' 
      });
    }
    
    creneau.statut = 'libre';
    await creneau.save();
    
    res.json({
      success: true,
      message: 'Créneau débloqué.',
      data: creneau
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors du déblocage.',
      error: error.message 
    });
  }
};

// SUPPRIMER CRÉNEAU
exports.supprimerCreneau = async (req, res) => {
  try {
    const creneau = await Creneau.findOne({
      _id: req.params.id,
      service: req.user.service,
      statut: { $in: ['libre', 'bloque'] }
    });
    
    if (!creneau) {
      return res.status(404).json({ 
        success: false,
        message: 'Créneau non trouvé ou déjà réservé.' 
      });
    }
    
    await creneau.deleteOne();
    
    res.json({
      success: true,
      message: 'Créneau supprimé.'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suppression.',
      error: error.message 
    });
  }
};