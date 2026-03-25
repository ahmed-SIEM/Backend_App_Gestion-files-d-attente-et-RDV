const { Ticket, RendezVous, Service, User, Creneau } = require('../models');

// DASHBOARD ÉTABLISSEMENT
exports.getDashboardEtablissement = async (req, res) => {
  try {
    const etablissementId = req.params.etablissementId;
    
    // Vérifier que l'admin gère bien cet établissement
    if (req.user.etablissement.toString() !== etablissementId) {
      return res.status(403).json({ 
        success: false,
        message: 'Accès non autorisé.' 
      });
    }
    
    // Date d'aujourd'hui
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const demain = new Date(aujourdhui);
    demain.setDate(demain.getDate() + 1);
    
    // 1. Tickets aujourd'hui
    const tickets_aujourdhui = await Ticket.countDocuments({
      etablissement: etablissementId,
      heure_creation: { $gte: aujourdhui, $lt: demain }
    });
    
    // 2. RDV aujourd'hui
    const creneauxAujourdhui = await Creneau.find({
      date: { $gte: aujourdhui, $lt: demain },
      statut: 'occupe'
    }).select('_id');
    
    const creneauxIds = creneauxAujourdhui.map(c => c._id);
    
    const rdv_aujourdhui = await RendezVous.countDocuments({
      etablissement: etablissementId,
      creneaux: { $in: creneauxIds },
      statut: { $in: ['confirme', 'en_cours'] }
    });
    
    // 3. Services actifs
    const services_actifs = await Service.countDocuments({
      etablissement: etablissementId,
      statut: 'actif'
    });
    
    // 4. Agents actifs
    const agents_actifs = await User.countDocuments({
      etablissement: etablissementId,
      role: 'agent',
      statut: 'actif'
    });
    
    // 5. Temps attente moyen (tickets servis aujourd'hui)
    const ticketsServis = await Ticket.find({
      etablissement: etablissementId,
      heure_service: { $gte: aujourdhui, $lt: demain },
      statut: 'servi',
      temps_attente_minutes: { $exists: true }
    });
    
    const temps_attente_moyen = ticketsServis.length > 0
      ? Math.round(ticketsServis.reduce((acc, t) => acc + t.temps_attente_minutes, 0) / ticketsServis.length)
      : 0;
    
    // 6. Satisfaction (placeholder - à implémenter avec système de feedback)
    const satisfaction = 94; // TODO: Calculer depuis feedback réel
    
    res.json({
      success: true,
      data: {
        tickets_aujourdhui,
        rdv_aujourdhui,
        services_actifs,
        agents_actifs,
        temps_attente_moyen,
        satisfaction
      }
    });
    
  } catch (error) {
    console.error('Erreur stats dashboard:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors du calcul des statistiques.',
      error: error.message 
    });
  }
};

// DASHBOARD PLATEFORME (Super Admin)
exports.getDashboardPlateforme = async (req, res) => {
  try {
    // TODO: Implémenter stats globales plateforme
    res.json({
      success: true,
      data: {
        etablissements_actifs: 0,
        citoyens_inscrits: 0,
        tickets_total: 0,
        rdv_total: 0
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

// STATS DÉTAILLÉES ÉTABLISSEMENT
exports.getStatsDetaillees = async (req, res) => {
  try {
    const { etablissementId } = req.params;
    const { dateDebut, dateFin } = req.query;
    
    // TODO: Implémenter stats détaillées avec période
    res.json({
      success: true,
      data: {
        message: 'Stats détaillées à venir'
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