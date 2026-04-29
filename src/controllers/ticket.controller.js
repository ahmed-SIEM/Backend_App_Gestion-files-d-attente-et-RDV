const { Ticket, Service, FileAttente, Etablissement } = require('../models');
const socketUtil = require('../utils/socket');
const whatsapp = require('../utils/whatsapp');
const { creerNotification } = require('../utils/notification');

// Helper : envoyer rappels WhatsApp aux citoyens proches de leur tour
async function checkAndSendQueueReminders(serviceId) {
  try {
    // Trouver tous les tickets en attente pour ce service
    const tickets = await Ticket.find({
      service: serviceId,
      statut: 'en_attente',
      rappel_bientot_envoye: false
    })
    .populate('citoyen', 'prenom nom telephone')
    .sort({ position: 1 });

    const etablissementInfo = await Service.findById(serviceId)
      .populate('etablissement', 'nom');

    for (const ticket of tickets) {
      // Compter combien de tickets sont avant ce citoyen
      const ticketsAvant = await Ticket.countDocuments({
        service: serviceId,
        statut: 'en_attente',
        position: { $lt: ticket.position }
      });

      // Exactement 5 (ou moins si file courte) → envoyer rappel "bientôt"
      if (ticketsAvant <= 5 && ticketsAvant > 0 && ticket.citoyen?.telephone) {
        await whatsapp.sendQueueBientotVotreTour(
          ticket.citoyen.telephone,
          ticket.citoyen.prenom || 'Client',
          ticket.numero,
          etablissementInfo?.nom || 'Service',
          etablissementInfo?.etablissement?.nom || 'Établissement',
          ticketsAvant
        );
        // Marquer comme envoyé pour ne pas renvoyer
        await Ticket.findByIdAndUpdate(ticket._id, { rappel_bientot_envoye: true });
      }
    }
  } catch (err) {
    console.error('Erreur rappels file:', err.message);
  }
}

// Helper : calculer et émettre les stats d'un service via Socket.io
async function emitServiceStats(serviceId) {
  try {
    const service = await Service.findById(serviceId);
    if (!service) return;

    const nombre_en_attente = await Ticket.countDocuments({ service: serviceId, statut: 'en_attente' });
    const ticketActuel = await Ticket.findOne({ service: serviceId, statut: 'appele' }).sort({ numero: -1 });
    const file = await FileAttente.findOne({ service: serviceId });

    const stats = {
      nombre_en_attente,
      ticket_actuel: ticketActuel ? ticketActuel.numero : null,
      temps_attente_estime: nombre_en_attente * (service.temps_traitement_moyen || 15),
      guichets_actifs: service.nombre_guichets || 1,
      total_guichets: service.nombre_guichets || 1,
      en_pause: file?.en_pause || false
    };

    socketUtil.emitQueueUpdate(serviceId.toString(), stats);
  } catch (err) {
    console.error('Socket emit error:', err.message);
  }
}

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

    // Notifier tous les clients qui suivent ce service
    await emitServiceStats(serviceId);

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

// MES TICKETS (actifs) — avec temps estimé recalculé en temps réel
exports.mesTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({
      citoyen: req.user._id,
      statut: { $in: ['en_attente', 'appele', 'en_cours'] }
    })
    .populate('service', 'nom temps_traitement_moyen')
    .populate('etablissement', 'nom adresse ville photo')
    .sort({ heure_creation: -1 });

    // Pour chaque ticket, recalculer position + temps estimé (sans compter les annulés)
    const ticketsAvecEstime = await Promise.all(tickets.map(async (ticket) => {
      const tempsParPersonne = ticket.service?.temps_traitement_moyen || 15;

      // Tickets en_attente devant moi (position strictement inférieure), hors annulés
      const devantMoi = await Ticket.countDocuments({
        service: ticket.service?._id || ticket.service,
        statut: 'en_attente',
        position: { $lt: ticket.position }
      });

      const tempsEstime = devantMoi * tempsParPersonne;

      const obj = ticket.toObject();
      obj.tickets_avant = devantMoi;
      obj.temps_attente_estime = tempsEstime; // minutes
      obj.position_file = devantMoi + 1;
      return obj;
    }));

    res.json({
      success: true,
      count: ticketsAvecEstime.length,
      data: ticketsAvecEstime
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

    await emitServiceStats(ticket.service);

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
    if (!req.user.service_id) {
      return res.status(400).json({ 
        success: false,
        message: 'Aucun service assigné à cet agent.' 
      });
    }
    
    const tickets = await Ticket.find({
      service: req.user.service_id,
      statut: { $in: ['en_attente', 'appele'] }
    })
    .populate('citoyen', 'prenom nom telephone')
    .sort({ position: 1 });
    
    const file = await FileAttente.findOne({ service: req.user.service_id });
    
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
    if (!req.user.service_id) {
      return res.status(400).json({ 
        success: false,
        message: 'Aucun service assigné.' 
      });
    }
    
    // Trouver le prochain ticket
    const ticket = await Ticket.findOne({
      service: req.user.service_id,
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
      { service: req.user.service_id },
      { numero_actuel: ticket.numero }
    );

    // Notifier tous les clients du service + le citoyen concerné
    await emitServiceStats(req.user.service_id);
    socketUtil.emitTicketCalled(ticket._id.toString(), {
      ticket_id: ticket._id,
      numero: ticket.numero,
      guichet: req.user.numero_guichet,
      message: `Ticket #${ticket.numero} appelé au guichet ${req.user.numero_guichet || 1}`
    });

    const svc = await Service.findById(req.user.service_id).populate('etablissement', 'nom');

    // Notification in-app au citoyen
    creerNotification({
      destinataire: ticket.citoyen._id,
      type: 'ticket_appele',
      titre: `🔔 C'est votre tour ! Ticket #${ticket.numero}`,
      message: `Rendez-vous au guichet ${req.user.numero_guichet || 1} — ${svc?.nom || 'Service'}, ${svc?.etablissement?.nom || 'Établissement'}`,
      lien: `/citoyen/track-ticket/${ticket._id}`,
      meta: { numero: ticket.numero, guichet: req.user.numero_guichet }
    });

    // WhatsApp au citoyen appelé
    if (ticket.citoyen?.telephone) {
      whatsapp.sendQueueVotreTour(
        ticket.citoyen.telephone,
        ticket.citoyen.prenom || 'Client',
        ticket.numero,
        req.user.numero_guichet,
        svc?.nom || 'Service',
        svc?.etablissement?.nom || 'Établissement'
      );
    }

    // Vérifier si d'autres citoyens sont maintenant proches de leur tour
    checkAndSendQueueReminders(req.user.service_id);

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

    await emitServiceStats(ticket.service);
    checkAndSendQueueReminders(ticket.service);

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

    await emitServiceStats(ticket.service);
    checkAndSendQueueReminders(ticket.service);

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
      { service: req.user.service_id },
      { en_pause: true },
      { new: true }
    );
    
    await emitServiceStats(req.user.service_id);
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
      { service: req.user.service_id },
      { en_pause: false },
      { new: true }
    );
    
    await emitServiceStats(req.user.service_id);
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
    
    const [tickets_traites, tickets_no_show, tickets] = await Promise.all([
      Ticket.countDocuments({
        agent: req.user._id,
        heure_appel: { $gte: aujourdhui },
        statut: 'servi'
      }),
      Ticket.countDocuments({
        agent: req.user._id,
        heure_appel: { $gte: aujourdhui },
        statut: 'no_show'
      }),
      Ticket.find({
        agent: req.user._id,
        heure_appel: { $gte: aujourdhui },
        statut: 'servi',
        temps_attente_minutes: { $exists: true }
      })
    ]);

    const temps_moyen = tickets.length > 0
      ? Math.round(tickets.reduce((acc, t) => acc + t.temps_attente_minutes, 0) / tickets.length)
      : 0;

    res.json({
      success: true,
      data: {
        tickets_traites,
        tickets_no_show,
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