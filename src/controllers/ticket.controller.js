const { Ticket, Service, FileAttente, Etablissement } = require('../models');

// ===== ROUTES CITOYEN =====

// PRENDRE UN TICKET
exports.prendreTicket = async (req, res) => {
  try {
    const { serviceId } = req.body;
    
    // 1. Vérifier que le service existe
    const service = await Service.findById(serviceId).populate('etablissement');
    
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service non trouvé.' 
      });
    }
    
    if (!service.file_activee) {
      return res.status(400).json({ 
        success: false,
        message: 'Ce service n\'a pas de file d\'attente.' 
      });
    }
    
    if (service.statut !== 'actif') {
      return res.status(400).json({ 
        success: false,
        message: 'Ce service est actuellement inactif.' 
      });
    }
    
    // 2. RÈGLE : Un seul ticket actif par service
    const ticketExistant = await Ticket.findOne({
      citoyen: req.user._id,
      service: serviceId,
      statut: { $in: ['en_attente', 'appele'] }
    });
    
    if (ticketExistant) {
      return res.status(400).json({ 
        success: false,
        message: 'Vous avez déjà un ticket actif pour ce service.' 
      });
    }
    
    // 3. RÈGLE : Anti-spam (3 annulations max/jour)
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const demain = new Date(aujourdhui);
    demain.setDate(demain.getDate() + 1);
    
    const annulationsAujourdhui = await Ticket.countDocuments({
      citoyen: req.user._id,
      service: serviceId,
      statut: 'annule',
      date_annulation: { $gte: aujourdhui, $lt: demain }
    });
    
    if (annulationsAujourdhui >= 3) {
      return res.status(400).json({ 
        success: false,
        message: 'Vous avez atteint la limite d\'annulations pour aujourd\'hui (3 max). Réessayez demain.' 
      });
    }
    
    // 4. RÈGLE : Vérifier les horaires de l'établissement
    const maintenant = new Date();
    const heureActuelle = maintenant.getHours() * 60 + maintenant.getMinutes(); // en minutes
    const jourSemaine = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][maintenant.getDay()];
    
    const horairesJour = service.etablissement.horaires?.[jourSemaine];
    
    if (!horairesJour || !horairesJour.ouvert) {
      return res.status(400).json({ 
        success: false,
        message: 'L\'établissement est fermé aujourd\'hui.' 
      });
    }
    
    // Convertir heures en minutes
    const [heureDebut, minuteDebut] = horairesJour.ouverture.split(':').map(Number);
    const [heureFin, minuteFin] = horairesJour.fermeture.split(':').map(Number);
    const ouverture = heureDebut * 60 + minuteDebut;
    const fermeture = heureFin * 60 + minuteFin;
    
    if (heureActuelle < ouverture) {
      return res.status(400).json({ 
        success: false,
        message: `L'établissement ouvre à ${horairesJour.ouverture}.` 
      });
    }
    
    // 5. RÈGLE : Vérifier si peut être servi avant fermeture
    const tempsTraitementMoyen = service.temps_traitement_moyen || 15; // minutes
    
    // Compter tickets en attente
    const ticketsEnAttente = await Ticket.countDocuments({
      service: serviceId,
      statut: 'en_attente'
    });
    
    // Temps estimé pour servir tous les tickets devant + moi
    const tempsEstimeMinutes = (ticketsEnAttente + 1) * tempsTraitementMoyen;
    const heureEstimeeFin = heureActuelle + tempsEstimeMinutes;
    
    // Vérifier si on peut finir avant la fermeture
    if (heureEstimeeFin > fermeture) {
      const heureFermetureStr = horairesJour.fermeture;
      return res.status(400).json({ 
        success: false,
        message: `Impossible d'être servi avant la fermeture (${heureFermetureStr}). Temps d'attente estimé : ${tempsEstimeMinutes} minutes.` 
      });
    }
    
    // Vérifier si assez de temps pour au moins UN service
    const tempsPourUnService = heureActuelle + tempsTraitementMoyen;
    if (tempsPourUnService > fermeture) {
      return res.status(400).json({ 
        success: false,
        message: `Trop tard pour prendre un ticket. L'établissement ferme dans moins de ${tempsTraitementMoyen} minutes.` 
      });
    }
    
    // 6. Récupérer ou créer la file d'attente
    let file = await FileAttente.findOne({ service: serviceId });
    
    if (!file) {
      file = await FileAttente.create({ service: serviceId });
    }
    
    // Vérifier si en pause
    if (file.en_pause) {
      return res.status(400).json({ 
        success: false,
        message: 'La file est actuellement en pause.' 
      });
    }
    
    // 7. Générer le numéro de ticket
    file.dernier_numero_genere += 1;
    const numeroTicket = file.dernier_numero_genere;
    await file.save();
    
    // 8. Créer le ticket
    const ticket = await Ticket.create({
      numero: numeroTicket,
      citoyen: req.user._id,
      service: serviceId,
      etablissement: service.etablissement._id,
      position: ticketsEnAttente + 1,
      statut: 'en_attente',
      temps_attente_minutes: tempsEstimeMinutes
    });
    
    // Populer les infos
    await ticket.populate('service etablissement');
    
    res.status(201).json({
      success: true,
      message: 'Ticket créé avec succès !',
      data: ticket
    });
    
  } catch (error) {
    console.error('Erreur création ticket:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la création du ticket.',
      error: error.message 
    });
  }
};

// MES TICKETS (actifs)
exports.mesTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({
      citoyen: req.user._id,
      statut: { $in: ['en_attente', 'appele', 'en_cours'] }
    })
    .populate('service', 'nom')
    .populate('etablissement', 'nom adresse')
    .sort({ heure_creation: -1 });
    
    res.json({
      success: true,
      count: tickets.length,
      data: tickets
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des tickets.',
      error: error.message 
    });
  }
};

// DÉTAILS D'UN TICKET
exports.detailsTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      citoyen: req.user._id
    })
    .populate('service', 'nom temps_traitement_moyen')
    .populate('etablissement', 'nom adresse telephone_etablissement');
    
    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: 'Ticket non trouvé.' 
      });
    }
    
    // Calculer tickets avant moi
    const ticketsAvant = await Ticket.countDocuments({
      service: ticket.service._id,
      statut: 'en_attente',
      position: { $lt: ticket.position }
    });
    
    // Calculer temps estimé
    const tempsEstime = ticketsAvant * (ticket.service.temps_traitement_moyen || 15);
    
    res.json({
      success: true,
      data: {
        ...ticket.toObject(),
        tickets_avant: ticketsAvant,
        temps_estime_minutes: tempsEstime
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du ticket.',
      error: error.message 
    });
  }
};

// ANNULER TICKET
exports.annulerTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      citoyen: req.user._id,
      statut: { $in: ['en_attente', 'appele'] }
    });
    
    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: 'Ticket non trouvé ou ne peut pas être annulé.' 
      });
    }
    
    // ⭐ IMPORTANT : Enregistrer la date d'annulation pour anti-spam
    ticket.statut = 'annule';
    ticket.date_annulation = new Date();
    await ticket.save();
    
    res.json({
      success: true,
      message: 'Ticket annulé avec succès !',
      data: ticket
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'annulation.',
      error: error.message 
    });
  }
};

// ===== ROUTES AGENT =====

// FILE D'ATTENTE DU SERVICE
exports.fileAttente = async (req, res) => {
  try {
    // Vérifier que l'agent a un service assigné
    if (!req.user.service) {
      return res.status(400).json({ 
        success: false,
        message: 'Aucun service assigné à cet agent.' 
      });
    }
    
    const tickets = await Ticket.find({
      service: req.user.service,
      statut: { $in: ['en_attente', 'appele'] }
    })
    .populate('citoyen', 'prenom nom telephone')
    .sort({ position: 1 });
    
    const file = await FileAttente.findOne({ service: req.user.service });
    
    res.json({
      success: true,
      data: {
        tickets,
        en_pause: file?.en_pause || false,
        numero_actuel: file?.numero_actuel || 0
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération de la file.',
      error: error.message 
    });
  }
};

// APPELER PROCHAIN TICKET
exports.appellerProchain = async (req, res) => {
  try {
    if (!req.user.service) {
      return res.status(400).json({ 
        success: false,
        message: 'Aucun service assigné.' 
      });
    }
    
    // Trouver le prochain ticket
    const ticket = await Ticket.findOne({
      service: req.user.service,
      statut: 'en_attente'
    })
    .sort({ position: 1 })
    .populate('citoyen', 'prenom nom telephone');
    
    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: 'Aucun ticket en attente.' 
      });
    }
    
    // Mettre à jour le ticket
    ticket.statut = 'appele';
    ticket.heure_appel = new Date();
    ticket.agent = req.user._id;
    ticket.guichet = req.user.numero_guichet;
    await ticket.save();
    
    // Mettre à jour la file
    await FileAttente.findOneAndUpdate(
      { service: req.user.service },
      { numero_actuel: ticket.numero }
    );
    
    res.json({
      success: true,
      message: 'Ticket appelé !',
      data: ticket
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'appel du ticket.',
      error: error.message 
    });
  }
};

// MARQUER TICKET SERVI
exports.marquerServi = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      agent: req.user._id,
      statut: { $in: ['appele', 'en_cours'] }
    });
    
    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: 'Ticket non trouvé.' 
      });
    }
    
    ticket.statut = 'servi';
    ticket.heure_service = new Date();
    
    // Calculer temps d'attente
    const tempsAttente = Math.floor((ticket.heure_service - ticket.heure_creation) / 60000);
    ticket.temps_attente_minutes = tempsAttente;
    
    await ticket.save();
    
    // Incrémenter compteur
    await FileAttente.findOneAndUpdate(
      { service: ticket.service },
      { $inc: { tickets_servis_aujourdhui: 1 } }
    );
    
    res.json({
      success: true,
      message: 'Ticket marqué comme servi !',
      data: ticket
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour.',
      error: error.message 
    });
  }
};

// MARQUER ABSENT (NO-SHOW)
exports.marquerAbsent = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      agent: req.user._id,
      statut: 'appele'
    });
    
    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: 'Ticket non trouvé.' 
      });
    }
    
    ticket.statut = 'no_show';
    await ticket.save();
    
    res.json({
      success: true,
      message: 'Ticket marqué comme absent.',
      data: ticket
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour.',
      error: error.message 
    });
  }
};

// METTRE FILE EN PAUSE
exports.mettreEnPause = async (req, res) => {
  try {
    const file = await FileAttente.findOneAndUpdate(
      { service: req.user.service },
      { en_pause: true },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'File mise en pause.',
      data: file
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise en pause.',
      error: error.message 
    });
  }
};

// REPRENDRE FILE
exports.reprendreFile = async (req, res) => {
  try {
    const file = await FileAttente.findOneAndUpdate(
      { service: req.user.service },
      { en_pause: false },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'File reprise.',
      data: file
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la reprise.',
      error: error.message 
    });
  }
};

// STATISTIQUES AGENT
exports.statsAgent = async (req, res) => {
  try {
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    
    const tickets_traites = await Ticket.countDocuments({
      agent: req.user._id,
      heure_service: { $gte: aujourdhui },
      statut: 'servi'
    });
    
    const tickets = await Ticket.find({
      agent: req.user._id,
      heure_service: { $gte: aujourdhui },
      statut: 'servi',
      temps_attente_minutes: { $exists: true }
    });
    
    const temps_moyen = tickets.length > 0
      ? Math.round(tickets.reduce((acc, t) => acc + t.temps_attente_minutes, 0) / tickets.length)
      : 0;
    
    res.json({
      success: true,
      data: {
        tickets_traites,
        temps_moyen_minutes: temps_moyen
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors du calcul des statistiques.',
      error: error.message 
    });
  }
};