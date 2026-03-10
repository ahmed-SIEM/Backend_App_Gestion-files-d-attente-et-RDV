const { RendezVous, Creneau, Service, Calendrier } = require('../models');

// ===== ROUTES CITOYEN =====

// LISTE CRÉNEAUX DISPONIBLES
exports.creneauxDisponibles = async (req, res) => {
  try {
    const { serviceId, date } = req.query;
    
    if (!serviceId || !date) {
      return res.status(400).json({ 
        success: false,
        message: 'Service et date requis.' 
      });
    }
    
    // Vérifier que le service a les RDV activés
    const service = await Service.findById(serviceId);
    
    if (!service || !service.rdv_active) {
      return res.status(400).json({ 
        success: false,
        message: 'Ce service ne propose pas de rendez-vous.' 
      });
    }
    
    // Chercher les créneaux libres
    const dateRecherche = new Date(date);
    const dateDebut = new Date(dateRecherche.setHours(0, 0, 0, 0));
    const dateFin = new Date(dateRecherche.setHours(23, 59, 59, 999));
    
    const creneaux = await Creneau.find({
      service: serviceId,
      date: { $gte: dateDebut, $lte: dateFin },
      statut: 'libre'
    }).sort({ heure_debut: 1 });
    
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

// RÉSERVER RDV
exports.reserverRDV = async (req, res) => {
  try {
    const { creneauxIds, serviceId, motif } = req.body;
    
    if (!creneauxIds || creneauxIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Au moins un créneau requis.' 
      });
    }
    
    // Vérifier que tous les créneaux sont libres
    const creneaux = await Creneau.find({
      _id: { $in: creneauxIds },
      statut: 'libre'
    });
    
    if (creneaux.length !== creneauxIds.length) {
      return res.status(400).json({ 
        success: false,
        message: 'Un ou plusieurs créneaux ne sont plus disponibles.' 
      });
    }
    
    // Récupérer le service et l'établissement
    const service = await Service.findById(serviceId).populate('etablissement');
    
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service non trouvé.' 
      });
    }
    
    // Créer le RDV
    const rdv = await RendezVous.create({
      citoyen: req.user._id,
      creneaux: creneauxIds,
      service: serviceId,
      etablissement: service.etablissement._id,
      motif,
      statut: 'confirme'
    });
    
    // Marquer les créneaux comme occupés
    await Creneau.updateMany(
      { _id: { $in: creneauxIds } },
      { statut: 'occupe' }
    );
    
    await rdv.populate('creneaux service etablissement');
    
    res.status(201).json({
      success: true,
      message: 'Rendez-vous réservé avec succès !',
      data: rdv
    });
    
  } catch (error) {
    console.error('Erreur réservation RDV:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la réservation.',
      error: error.message 
    });
  }
};

// MES RDV
exports.mesRDV = async (req, res) => {
  try {
    const rdvs = await RendezVous.find({
      citoyen: req.user._id,
      statut: { $in: ['confirme', 'en_cours'] }
    })
    .populate('creneaux')
    .populate('service', 'nom')
    .populate('etablissement', 'nom adresse')
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: rdvs.length,
      data: rdvs
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des RDV.',
      error: error.message 
    });
  }
};

// DÉTAILS RDV
exports.detailsRDV = async (req, res) => {
  try {
    const rdv = await RendezVous.findOne({
      _id: req.params.id,
      citoyen: req.user._id
    })
    .populate('creneaux')
    .populate('service', 'nom')
    .populate('etablissement', 'nom adresse telephone');
    
    if (!rdv) {
      return res.status(404).json({ 
        success: false,
        message: 'Rendez-vous non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      data: rdv
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du RDV.',
      error: error.message 
    });
  }
};

// ANNULER RDV
exports.annulerRDV = async (req, res) => {
  try {
    const rdv = await RendezVous.findOne({
      _id: req.params.id,
      citoyen: req.user._id,
      statut: 'confirme'
    });
    
    if (!rdv) {
      return res.status(404).json({ 
        success: false,
        message: 'RDV non trouvé ou ne peut pas être annulé.' 
      });
    }
    
    // Annuler le RDV
    rdv.statut = 'annule';
    rdv.date_annulation = new Date();
    await rdv.save();
    
    // Libérer les créneaux
    await Creneau.updateMany(
      { _id: { $in: rdv.creneaux } },
      { statut: 'libre' }
    );
    
    res.json({
      success: true,
      message: 'Rendez-vous annulé avec succès !',
      data: rdv
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'annulation.',
      error: error.message 
    });
  }
};

// REPROGRAMMER RDV
exports.reprogrammerRDV = async (req, res) => {
  try {
    const { nouveauxCreneauxIds } = req.body;
    
    const rdv = await RendezVous.findOne({
      _id: req.params.id,
      citoyen: req.user._id,
      statut: 'confirme'
    });
    
    if (!rdv) {
      return res.status(404).json({ 
        success: false,
        message: 'RDV non trouvé.' 
      });
    }
    
    // TODO: Vérifier délai de 24h (selon config établissement)
    
    // Vérifier que les nouveaux créneaux sont libres
    const nouveauxCreneaux = await Creneau.find({
      _id: { $in: nouveauxCreneauxIds },
      statut: 'libre'
    });
    
    if (nouveauxCreneaux.length !== nouveauxCreneauxIds.length) {
      return res.status(400).json({ 
        success: false,
        message: 'Un ou plusieurs créneaux ne sont plus disponibles.' 
      });
    }
    
    // Libérer les anciens créneaux
    await Creneau.updateMany(
      { _id: { $in: rdv.creneaux } },
      { statut: 'libre' }
    );
    
    // Marquer les nouveaux comme occupés
    await Creneau.updateMany(
      { _id: { $in: nouveauxCreneauxIds } },
      { statut: 'occupe' }
    );
    
    // Mettre à jour le RDV
    rdv.creneaux = nouveauxCreneauxIds;
    await rdv.save();
    await rdv.populate('creneaux');
    
    res.json({
      success: true,
      message: 'RDV reprogrammé avec succès !',
      data: rdv
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la reprogrammation.',
      error: error.message 
    });
  }
};

// ===== ROUTES AGENT =====

// MES RDV DU JOUR
exports.mesRDVJour = async (req, res) => {
  try {
    if (!req.user.service) {
      return res.status(400).json({ 
        success: false,
        message: 'Aucun service assigné.' 
      });
    }
    
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const demain = new Date(aujourdhui);
    demain.setDate(demain.getDate() + 1);
    
    // Trouver mon calendrier
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
    
    // Trouver mes créneaux du jour
    const creneaux = await Creneau.find({
      calendrier: calendrier._id,
      date: { $gte: aujourdhui, $lt: demain },
      statut: 'occupe'
    }).sort({ heure_debut: 1 });
    
    // Trouver les RDV correspondants
    const rdvs = await RendezVous.find({
      creneaux: { $in: creneaux.map(c => c._id) },
      statut: { $in: ['confirme', 'en_cours'] }
    })
    .populate('citoyen', 'prenom nom telephone')
    .populate('creneaux');
    
    res.json({
      success: true,
      count: rdvs.length,
      data: rdvs
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des RDV.',
      error: error.message 
    });
  }
};

// MARQUER RDV PRÉSENT
exports.marquerPresent = async (req, res) => {
  try {
    const rdv = await RendezVous.findByIdAndUpdate(
      req.params.id,
      { statut: 'en_cours' },
      { new: true }
    ).populate('citoyen creneaux');
    
    if (!rdv) {
      return res.status(404).json({ 
        success: false,
        message: 'RDV non trouvé.' 
      });
    }
    
    res.json({
      success: true,
      message: 'Patient marqué présent.',
      data: rdv
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour.',
      error: error.message 
    });
  }
};

// MARQUER RDV TERMINÉ
exports.marquerTermine = async (req, res) => {
  try {
    const rdv = await RendezVous.findByIdAndUpdate(
      req.params.id,
      { statut: 'termine' },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'RDV terminé.',
      data: rdv
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour.',
      error: error.message 
    });
  }
};

// MARQUER NO-SHOW
exports.marquerNoShow = async (req, res) => {
  try {
    const rdv = await RendezVous.findByIdAndUpdate(
      req.params.id,
      { statut: 'no_show' },
      { new: true }
    );
    
    // Libérer les créneaux
    await Creneau.updateMany(
      { _id: { $in: rdv.creneaux } },
      { statut: 'libre' }
    );
    
    res.json({
      success: true,
      message: 'Patient marqué absent.',
      data: rdv
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour.',
      error: error.message 
    });
  }
};