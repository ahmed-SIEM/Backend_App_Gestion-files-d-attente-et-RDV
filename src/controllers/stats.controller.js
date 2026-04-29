const { Ticket, RendezVous, Service, User, Creneau, Etablissement } = require('../models');
const mongoose = require('mongoose');

// DASHBOARD ÉTABLISSEMENT
exports.getDashboardEtablissement = async (req, res) => {
  try {
    const etablissementId = req.params.etablissementId;

    // Vérifier que l'admin gère bien cet établissement
    if (req.user.etablissement_id.toString() !== etablissementId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé.'
      });
    }

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
      etablissement_id: etablissementId,
      role: 'agent',
      statut: 'actif'
    });

    // 5. Temps attente moyen
    const ticketsServis = await Ticket.find({
      etablissement: etablissementId,
      heure_service: { $gte: aujourdhui, $lt: demain },
      statut: 'servi',
      temps_attente_minutes: { $exists: true }
    });

    const temps_attente_moyen = ticketsServis.length > 0
      ? Math.round(ticketsServis.reduce((acc, t) => acc + t.temps_attente_minutes, 0) / ticketsServis.length)
      : 0;

    // 6. Satisfaction (basée sur le taux de présence aux RDV)
    const rdvTotal = await RendezVous.countDocuments({
      etablissement: etablissementId,
      statut: { $in: ['termine', 'no_show'] }
    });
    const rdvTermines = await RendezVous.countDocuments({
      etablissement: etablissementId,
      statut: 'termine'
    });
    const satisfaction = rdvTotal > 0 ? Math.round((rdvTermines / rdvTotal) * 100) : 94;

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
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const demain = new Date(aujourdhui);
    demain.setDate(demain.getDate() + 1);

    const [
      etablissements_actifs,
      etablissements_en_attente,
      etablissements_suspendus,
      citoyens_inscrits,
      tickets_aujourd_hui,
      rdv_aujourd_hui,
      total_etablissements
    ] = await Promise.all([
      Etablissement.countDocuments({ statut: 'actif' }),
      Etablissement.countDocuments({ statut: 'en_attente' }),
      Etablissement.countDocuments({ statut: 'suspendu' }),
      User.countDocuments({ role: 'citoyen', statut: 'actif' }),
      Ticket.countDocuments({ heure_creation: { $gte: aujourdhui, $lt: demain } }),
      RendezVous.countDocuments({
        statut: { $in: ['confirme', 'en_cours'] },
        createdAt: { $gte: aujourdhui, $lt: demain }
      }),
      Etablissement.countDocuments()
    ]);

    res.json({
      success: true,
      data: {
        etablissements_actifs,
        etablissements_en_attente,
        etablissements_suspendus,
        total_etablissements,
        citoyens_inscrits,
        tickets_aujourd_hui,
        rdv_aujourd_hui
      }
    });

  } catch (error) {
    console.error('Erreur stats plateforme:', error);
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

    const debut = dateDebut ? new Date(dateDebut) : (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; })();
    const fin = dateFin ? new Date(dateFin) : new Date();

    const [tickets_total, rdv_total, ticketsServis, rdvTermines, rdvTotal] = await Promise.all([
      Ticket.countDocuments({
        etablissement: etablissementId,
        heure_creation: { $gte: debut, $lte: fin }
      }),
      RendezVous.countDocuments({
        etablissement: etablissementId,
        createdAt: { $gte: debut, $lte: fin }
      }),
      Ticket.find({
        etablissement: etablissementId,
        statut: 'servi',
        heure_service: { $gte: debut, $lte: fin },
        temps_attente_minutes: { $exists: true }
      }).select('temps_attente_minutes'),
      RendezVous.countDocuments({
        etablissement: etablissementId,
        statut: 'termine',
        createdAt: { $gte: debut, $lte: fin }
      }),
      RendezVous.countDocuments({
        etablissement: etablissementId,
        statut: { $in: ['termine', 'no_show'] },
        createdAt: { $gte: debut, $lte: fin }
      })
    ]);

    const temps_attente_moyen = ticketsServis.length > 0
      ? Math.round(ticketsServis.reduce((acc, t) => acc + t.temps_attente_minutes, 0) / ticketsServis.length)
      : 0;

    const taux_presence = rdvTotal > 0 ? Math.round((rdvTermines / rdvTotal) * 100) : 0;

    const etabObjId = new mongoose.Types.ObjectId(etablissementId);

    // Stats par jour sur la période
    const ticketsParJour = await Ticket.aggregate([
      {
        $match: {
          etablissement: etabObjId,
          heure_creation: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$heure_creation' } },
          tickets: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const rdvParJour = await RendezVous.aggregate([
      {
        $match: {
          etablissement: etabObjId,
          createdAt: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          rdv: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fusionner tickets et rdv par jour
    const joursMap = {};
    ticketsParJour.forEach(j => {
      joursMap[j._id] = { date: j._id, tickets: j.tickets, rdv: 0 };
    });
    rdvParJour.forEach(j => {
      if (joursMap[j._id]) joursMap[j._id].rdv = j.rdv;
      else joursMap[j._id] = { date: j._id, tickets: 0, rdv: j.rdv };
    });
    const par_jour = Object.values(joursMap).sort((a, b) => a.date.localeCompare(b.date));

    // Services les plus utilisés
    const servicesEtab = await Service.find({ etablissement: etablissementId }).select('_id nom');
    const servicesIds = servicesEtab.map(s => s._id);

    const ticketsParService = await Ticket.aggregate([
      { $match: { service: { $in: servicesIds }, heure_creation: { $gte: debut, $lte: fin } } },
      { $group: { _id: '$service', tickets: { $sum: 1 } } },
      { $sort: { tickets: -1 } },
      { $limit: 5 }
    ]);

    const total_pour_pourcentage = ticketsParService.reduce((a, s) => a + s.tickets, 0);
    const services_populaires = ticketsParService.map(s => {
      const svc = servicesEtab.find(sv => sv._id.toString() === s._id.toString());
      return {
        nom: svc?.nom || 'Service',
        tickets: s.tickets,
        pourcentage: total_pour_pourcentage > 0 ? Math.round((s.tickets / total_pour_pourcentage) * 100) : 0
      };
    });

    res.json({
      success: true,
      data: {
        tickets_total,
        rdv_total,
        temps_attente_moyen,
        taux_presence,
        tickets_servis: ticketsServis.length,
        rdv_termines: rdvTermines,
        par_jour,
        services_populaires
      }
    });

  } catch (error) {
    console.error('Erreur stats détaillées:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul des statistiques.',
      error: error.message
    });
  }
};
