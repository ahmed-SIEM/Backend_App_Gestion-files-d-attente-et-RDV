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

// ⭐ STATS PUBLIQUES D'UN SERVICE
exports.statsService = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier que le service existe
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service non trouvé' 
      });
    }
    
    // Import sécurisé du modèle Ticket
    const mongoose = require('mongoose');
    const Ticket = mongoose.model('Ticket');
    
    // Compter les tickets en attente
    const ticketsEnAttente = await Ticket.countDocuments({
      service: id,
      statut: 'en_attente'
    });
    
    // Trouver le ticket actuel (appelé)
    const ticketActuel = await Ticket.findOne({
      service: id,
      statut: 'appele'
    }).sort({ numero: -1 });
    
    // Calculer le temps d'attente estimé (en minutes)
    const tempsAttente = ticketsEnAttente * (service.temps_traitement_moyen || 15);
    
    // Utiliser le nombre de guichets du service
    const guichetsActifs = service.nombre_guichets || 1;
    
    // Stats RDV si activé
    let rdvStats = null;
    if (service.rdv_active) {
      const Creneau = mongoose.model('Creneau');
      const maintenant = new Date();
      const debutJour = new Date(); debutJour.setHours(0,0,0,0);
      const finSemaine = new Date(); finSemaine.setDate(finSemaine.getDate() + 7);

      const creneauxDisponibles = await Creneau.countDocuments({
        service: id,
        statut: 'libre',
        date: { $gte: maintenant, $lte: finSemaine }
      });

      const prochainCreneau = await Creneau.findOne({
        service: id,
        statut: 'libre',
        date: { $gte: maintenant }
      }).sort({ date: 1, heure_debut: 1 });

      rdvStats = {
        creneaux_disponibles: creneauxDisponibles,
        prochain_creneau: prochainCreneau ? {
          date: prochainCreneau.date,
          heure_debut: prochainCreneau.heure_debut,
          heure_fin: prochainCreneau.heure_fin,
          duree_minutes: prochainCreneau.duree_minutes
        } : null,
        duree_rdv: service.temps_traitement_moyen || 30
      };
    }

    res.json({
      success: true,
      data: {
        nombre_en_attente: ticketsEnAttente,
        ticket_actuel: ticketActuel ? ticketActuel.numero : null,
        temps_attente_estime: tempsAttente,
        guichets_actifs: guichetsActifs,
        total_guichets: service.nombre_guichets || 1,
        rdv: rdvStats
      }
    });
    
  } catch (error) {
    console.error('Erreur stats service:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
};

// ===== ROUTES ADMIN ÉTABLISSEMENT =====

// MES SERVICES
exports.mesServices = async (req, res) => {
  try {
    const services = await Service.find({ 
      etablissement: req.user.etablissement_id 
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
      etablissement: req.user.etablissement_id,
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
        etablissement: req.user.etablissement_id 
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
      etablissement: req.user.etablissement_id
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
      etablissement: req.user.etablissement_id
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