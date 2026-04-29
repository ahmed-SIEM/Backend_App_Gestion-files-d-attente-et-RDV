const { RendezVous, Creneau, Service, Calendrier, User } = require('../models');
const { sendRdvFermetureExceptionnelle, sendRdvHoraireModifie } = require('../utils/whatsapp');

// Mapping jour français → numéro JS (0=dimanche)
const JOURS_MAP = {
  'dimanche': 0, 'lundi': 1, 'mardi': 2,
  'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6
};

// ============================================================
// Helper : génère les créneaux horaires pour une date donnée
// à partir de la config_rdv d'un service
// Retourne null si le jour est fermé, [] si problème de config
// ============================================================
function genererSlotsPourDate(config, date) {
  if (!config || !config.jours || config.jours.length === 0) return null;

  const dayName = Object.keys(JOURS_MAP).find(k => JOURS_MAP[k] === date.getDay());
  if (!config.jours.includes(dayName)) return null; // Pas un jour travaillé

  const dateStr = date.toISOString().split('T')[0];

  // Vérifier les exceptions (supporte plage date_debut → date_fin)
  const exception = (config.exceptions || []).find(e => {
    const start = new Date(e.date).toISOString().split('T')[0];
    const end = e.date_fin ? new Date(e.date_fin).toISOString().split('T')[0] : start;
    return dateStr >= start && dateStr <= end;
  });
  if (exception?.type === 'ferme') return null;

  const heureDebut = (exception?.type === 'horaire_modifie' && exception.heure_debut_exceptionnelle)
    ? exception.heure_debut_exceptionnelle
    : config.heure_debut || '08:00';

  const heureFin = (exception?.type === 'horaire_modifie' && exception.heure_fin_exceptionnelle)
    ? exception.heure_fin_exceptionnelle
    : config.heure_fin || '17:00';

  const duree = config.duree_creneau || 30;
  const [hdH, hdM] = heureDebut.split(':').map(Number);
  const [hfH, hfM] = heureFin.split(':').map(Number);
  const finMin = hfH * 60 + hfM;

  const pauseDebutMin = config.pause_debut
    ? (() => { const [h, m] = config.pause_debut.split(':').map(Number); return h * 60 + m; })()
    : null;
  const pauseFinMin = config.pause_fin
    ? (() => { const [h, m] = config.pause_fin.split(':').map(Number); return h * 60 + m; })()
    : null;

  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const slots = [];
  let heure = hdH * 60 + hdM;
  while (heure + duree <= finMin) {
    if (pauseDebutMin !== null && pauseFinMin !== null) {
      if (heure >= pauseDebutMin && heure < pauseFinMin) { heure = pauseFinMin; continue; }
      if (heure < pauseDebutMin && heure + duree > pauseDebutMin) { heure = pauseFinMin; continue; }
    }
    slots.push({ heure_debut: fmt(heure), heure_fin: fmt(heure + duree) });
    heure += duree;
  }
  return slots;
}

// ===== ROUTES CITOYEN =====

// CRÉNEAUX DISPONIBLES (avec auto-génération si config_rdv définie)
exports.creneauxDisponibles = async (req, res) => {
  try {
    const { serviceId, date } = req.query;

    if (!serviceId || !date) {
      return res.status(400).json({ success: false, message: 'Service et date requis.' });
    }

    const service = await Service.findById(serviceId);
    if (!service || !service.rdv_active) {
      return res.status(400).json({ success: false, message: 'Ce service ne propose pas de rendez-vous.' });
    }

    const dateDebut = new Date(date);
    dateDebut.setHours(0, 0, 0, 0);
    const dateFin = new Date(date);
    dateFin.setHours(23, 59, 59, 999);

    let creneaux = await Creneau.find({
      service: serviceId,
      date: { $gte: dateDebut, $lte: dateFin }
    }).sort({ heure_debut: 1 });

    // Auto-génération : si aucun créneau et config_rdv définie
    if (creneaux.length === 0 && service.config_rdv) {
      const slots = genererSlotsPourDate(service.config_rdv, dateDebut);

      if (slots && slots.length > 0) {
        const agents = await User.find({ service_id: serviceId, role: 'agent', statut: 'actif' });

        if (agents.length > 0) {
          const creneauxACreer = [];

          for (const agent of agents) {
            const cal = await Calendrier.findOneAndUpdate(
              { agent: agent._id, service: serviceId },
              { duree_rdv_defaut: service.config_rdv.duree_creneau },
              { upsert: true, new: true }
            );
            for (const slot of slots) {
              creneauxACreer.push({
                calendrier: cal._id,
                service: serviceId,
                date: dateDebut,
                heure_debut: slot.heure_debut,
                heure_fin: slot.heure_fin,
                duree_minutes: service.config_rdv.duree_creneau || 30,
                statut: 'libre'
              });
            }
          }

          await Creneau.insertMany(creneauxACreer);
          creneaux = await Creneau.find({
            service: serviceId,
            date: { $gte: dateDebut, $lte: dateFin }
          }).sort({ heure_debut: 1 });
        }
      }
    }

    res.json({ success: true, count: creneaux.length, data: creneaux });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// RÉSERVER RDV
exports.reserverRDV = async (req, res) => {
  try {
    const { creneauxIds, serviceId, motif } = req.body;

    if (!creneauxIds || creneauxIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins un créneau requis.' });
    }

    const creneaux = await Creneau.find({ _id: { $in: creneauxIds }, statut: 'libre' });
    if (creneaux.length !== creneauxIds.length) {
      return res.status(400).json({ success: false, message: 'Un ou plusieurs créneaux ne sont plus disponibles.' });
    }

    const service = await Service.findById(serviceId).populate('etablissement');
    if (!service) return res.status(404).json({ success: false, message: 'Service non trouvé.' });

    const rdv = await RendezVous.create({
      citoyen: req.user._id,
      creneaux: creneauxIds,
      service: serviceId,
      etablissement: service.etablissement._id,
      motif,
      statut: 'confirme'
    });

    await Creneau.updateMany({ _id: { $in: creneauxIds } }, { statut: 'occupe' });
    await rdv.populate('creneaux service etablissement');

    res.status(201).json({ success: true, message: 'Rendez-vous réservé avec succès !', data: rdv });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    res.json({ success: true, count: rdvs.length, data: rdvs });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DÉTAILS RDV
exports.detailsRDV = async (req, res) => {
  try {
    const rdv = await RendezVous.findOne({ _id: req.params.id, citoyen: req.user._id })
      .populate('creneaux')
      .populate('service', 'nom')
      .populate('etablissement', 'nom adresse telephone_etablissement');

    if (!rdv) return res.status(404).json({ success: false, message: 'Rendez-vous non trouvé.' });

    res.json({ success: true, data: rdv });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ANNULER RDV
exports.annulerRDV = async (req, res) => {
  try {
    const rdv = await RendezVous.findOne({ _id: req.params.id, citoyen: req.user._id, statut: 'confirme' });
    if (!rdv) return res.status(404).json({ success: false, message: 'RDV non trouvé ou ne peut pas être annulé.' });

    rdv.statut = 'annule';
    rdv.date_annulation = new Date();
    await rdv.save();

    await Creneau.updateMany({ _id: { $in: rdv.creneaux } }, { statut: 'libre' });

    res.json({ success: true, message: 'Rendez-vous annulé avec succès !', data: rdv });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// REPROGRAMMER RDV
exports.reprogrammerRDV = async (req, res) => {
  try {
    const { nouveauxCreneauxIds } = req.body;

    const rdv = await RendezVous.findOne({ _id: req.params.id, citoyen: req.user._id, statut: 'confirme' })
      .populate('creneaux');
    if (!rdv) return res.status(404).json({ success: false, message: 'RDV non trouvé.' });

    // Vérifier règle 24h
    const premierCreneau = rdv.creneaux?.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    if (premierCreneau) {
      const dateRdv = new Date(premierCreneau.date);
      const [h, m] = (premierCreneau.heure_debut || '00:00').split(':').map(Number);
      dateRdv.setHours(h, m, 0, 0);
      if ((dateRdv - new Date()) / (1000 * 60 * 60) < 24) {
        return res.status(400).json({ success: false, message: 'Impossible de reprogrammer moins de 24h avant le rendez-vous.' });
      }
    }

    const nouveauxCreneaux = await Creneau.find({ _id: { $in: nouveauxCreneauxIds }, statut: 'libre' });
    if (nouveauxCreneaux.length !== nouveauxCreneauxIds.length) {
      return res.status(400).json({ success: false, message: 'Un ou plusieurs créneaux ne sont plus disponibles.' });
    }

    await Creneau.updateMany({ _id: { $in: rdv.creneaux } }, { statut: 'libre' });
    await Creneau.updateMany({ _id: { $in: nouveauxCreneauxIds } }, { statut: 'occupe' });

    rdv.creneaux = nouveauxCreneauxIds;
    await rdv.save();
    await rdv.populate('creneaux');

    res.json({ success: true, message: 'RDV reprogrammé avec succès !', data: rdv });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== ROUTES AGENT =====

// MES RDV DU JOUR (supporte ?date=YYYY-MM-DD pour navigation)
exports.mesRDVJour = async (req, res) => {
  try {
    if (!req.user.service_id) {
      return res.status(400).json({ success: false, message: 'Aucun service assigné.' });
    }

    const serviceId = req.user.service_id;
    const baseDate = req.query.date ? new Date(req.query.date) : new Date();
    baseDate.setHours(0, 0, 0, 0);
    const finDate = new Date(baseDate);
    finDate.setDate(finDate.getDate() + 1);

    // Tous les créneaux occupés du service pour ce jour
    const creneaux = await Creneau.find({
      service: serviceId,
      date: { $gte: baseDate, $lt: finDate },
      statut: 'occupe'
    });

    const rdvs = await RendezVous.find({
      creneaux: { $in: creneaux.map(c => c._id) },
      statut: { $in: ['confirme', 'en_cours', 'termine', 'no_show'] }
    })
      .populate('citoyen', 'prenom nom telephone')
      .populate('cree_par_agent', 'prenom nom')
      .populate('creneaux');

    // Trier par heure de début
    rdvs.sort((a, b) => {
      const aH = a.creneaux?.[0]?.heure_debut || '00:00';
      const bH = b.creneaux?.[0]?.heure_debut || '00:00';
      return aH.localeCompare(bH);
    });

    res.json({ success: true, count: rdvs.length, data: rdvs });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// CRÉNEAUX DU JOUR (vue secrétaire — tous les créneaux avec RDV associés)
exports.creneauxJour = async (req, res) => {
  try {
    if (!req.user.service_id) {
      return res.status(400).json({ success: false, message: 'Aucun service assigné.' });
    }

    const serviceId = req.user.service_id;
    const baseDate = req.query.date ? new Date(req.query.date) : new Date();
    baseDate.setHours(0, 0, 0, 0);
    const finDate = new Date(baseDate);
    finDate.setDate(finDate.getDate() + 1);

    // Auto-génération si nécessaire
    let creneaux = await Creneau.find({
      service: serviceId,
      date: { $gte: baseDate, $lt: finDate }
    }).sort({ heure_debut: 1 });

    if (creneaux.length === 0) {
      const service = await Service.findById(serviceId);
      if (service?.config_rdv) {
        const slots = genererSlotsPourDate(service.config_rdv, baseDate);
        if (slots && slots.length > 0) {
          const agents = await User.find({ service_id: serviceId, role: 'agent', statut: 'actif' });
          if (agents.length > 0) {
            const aCreer = [];
            for (const agent of agents) {
              const cal = await Calendrier.findOneAndUpdate(
                { agent: agent._id, service: serviceId },
                { duree_rdv_defaut: service.config_rdv.duree_creneau },
                { upsert: true, new: true }
              );
              for (const slot of slots) {
                aCreer.push({ calendrier: cal._id, service: serviceId, date: baseDate, heure_debut: slot.heure_debut, heure_fin: slot.heure_fin, duree_minutes: service.config_rdv.duree_creneau || 30, statut: 'libre' });
              }
            }
            await Creneau.insertMany(aCreer);
            creneaux = await Creneau.find({ service: serviceId, date: { $gte: baseDate, $lt: finDate } }).sort({ heure_debut: 1 });
          }
        }
      }
    }

    // Récupérer les RDV pour les créneaux occupés
    const occupiedIds = creneaux.filter(c => c.statut === 'occupe').map(c => c._id);
    const rdvs = await RendezVous.find({
      creneaux: { $in: occupiedIds },
      statut: { $in: ['confirme', 'en_cours', 'termine', 'no_show'] }
    })
      .populate('citoyen', 'prenom nom telephone')
      .populate('cree_par_agent', 'prenom nom');

    // Indexer les RDV par créneau
    const rdvByCreneau = {};
    rdvs.forEach(rdv => {
      rdv.creneaux.forEach(cId => {
        rdvByCreneau[cId.toString()] = rdv;
      });
    });

    const enriched = creneaux.map(c => ({
      ...c.toObject(),
      rdv: rdvByCreneau[c._id.toString()] || null
    }));

    res.json({ success: true, count: enriched.length, data: enriched });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    if (!rdv) return res.status(404).json({ success: false, message: 'RDV non trouvé.' });

    res.json({ success: true, message: 'Patient marqué présent.', data: rdv });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    res.json({ success: true, message: 'RDV terminé.', data: rdv });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    if (rdv) {
      await Creneau.updateMany({ _id: { $in: rdv.creneaux } }, { statut: 'libre' });
    }

    res.json({ success: true, message: 'Patient marqué absent.', data: rdv });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// REPROGRAMMER RDV (par l'agent — sans restriction 24h)
exports.reprogrammerRDVAgent = async (req, res) => {
  try {
    const { date, heure_debut, heure_fin } = req.body;
    const serviceId = req.user.service_id;

    if (!serviceId) return res.status(400).json({ success: false, message: 'Aucun service assigné.' });
    if (!date || !heure_debut || !heure_fin) {
      return res.status(400).json({ success: false, message: 'Date, heure début et heure fin requis.' });
    }

    const rdv = await RendezVous.findOne({
      _id: req.params.id,
      service: serviceId,
      statut: 'confirme'
    }).populate('creneaux');

    if (!rdv) return res.status(404).json({ success: false, message: 'RDV non trouvé ou ne peut pas être reprogrammé.' });

    // Obtenir ou créer le calendrier de l'agent
    const cal = await Calendrier.findOneAndUpdate(
      { agent: req.user._id, service: serviceId },
      {},
      { upsert: true, new: true }
    );

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    // Vérifier pas de conflit sur ce nouveau créneau
    const conflit = await Creneau.findOne({
      service: serviceId,
      date: dateObj,
      heure_debut,
      statut: 'occupe'
    });
    if (conflit) return res.status(400).json({ success: false, message: 'Ce créneau est déjà réservé.' });

    // Chercher un créneau libre existant ou en créer un
    let nouveauCreneau = await Creneau.findOne({
      service: serviceId,
      date: dateObj,
      heure_debut,
      statut: 'libre'
    });

    if (!nouveauCreneau) {
      const [hdH, hdM] = heure_debut.split(':').map(Number);
      const [hfH, hfM] = heure_fin.split(':').map(Number);
      nouveauCreneau = await Creneau.create({
        calendrier: cal._id,
        service: serviceId,
        date: dateObj,
        heure_debut,
        heure_fin,
        duree_minutes: (hfH * 60 + hfM) - (hdH * 60 + hdM),
        statut: 'libre'
      });
    }

    // Libérer les anciens créneaux
    await Creneau.updateMany(
      { _id: { $in: rdv.creneaux.map(c => c._id || c) } },
      { statut: 'libre' }
    );

    // Marquer le nouveau créneau comme occupé
    nouveauCreneau.statut = 'occupe';
    await nouveauCreneau.save();

    // Mettre à jour le RDV
    rdv.creneaux = [nouveauCreneau._id];
    await rdv.save();
    await rdv.populate('creneaux citoyen');

    res.json({
      success: true,
      message: 'RDV reprogrammé avec succès !',
      data: rdv
    });

  } catch (error) {
    console.error('Erreur reprogrammation RDV agent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// CRÉER RDV MANUEL (réservation par téléphone)
exports.creerRDVAgent = async (req, res) => {
  try {
    const { date, heure_debut, heure_fin, nom_patient, telephone_patient, motif } = req.body;

    if (!req.user.service_id) {
      return res.status(400).json({ success: false, message: 'Aucun service assigné.' });
    }
    if (!nom_patient || !heure_debut || !heure_fin || !date) {
      return res.status(400).json({ success: false, message: 'Date, heures et nom patient requis.' });
    }

    const serviceId = req.user.service_id;
    const service = await Service.findById(serviceId).populate('etablissement');
    if (!service) return res.status(404).json({ success: false, message: 'Service non trouvé.' });

    const cal = await Calendrier.findOneAndUpdate(
      { agent: req.user._id, service: serviceId },
      {},
      { upsert: true, new: true }
    );

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    // Vérifier conflit
    const conflit = await Creneau.findOne({
      calendrier: cal._id,
      date: dateObj,
      heure_debut,
      statut: 'occupe'
    });
    if (conflit) return res.status(400).json({ success: false, message: 'Ce créneau est déjà réservé.' });

    // Créer ou réutiliser le créneau libre
    let creneau = await Creneau.findOne({ calendrier: cal._id, date: dateObj, heure_debut, statut: 'libre' });

    if (creneau) {
      creneau.statut = 'occupe';
      await creneau.save();
    } else {
      const [hdH, hdM] = heure_debut.split(':').map(Number);
      const [hfH, hfM] = heure_fin.split(':').map(Number);
      creneau = await Creneau.create({
        calendrier: cal._id,
        service: serviceId,
        date: dateObj,
        heure_debut,
        heure_fin,
        duree_minutes: (hfH * 60 + hfM) - (hdH * 60 + hdM),
        statut: 'occupe'
      });
    }

    const rdv = await RendezVous.create({
      creneaux: [creneau._id],
      service: serviceId,
      etablissement: service.etablissement._id,
      nom_patient,
      telephone_patient,
      motif,
      cree_par_agent: req.user._id,
      statut: 'confirme'
    });

    await rdv.populate('creneaux service');

    res.status(201).json({
      success: true,
      message: `RDV créé pour ${nom_patient} le ${date} à ${heure_debut}.`,
      data: rdv
    });

  } catch (error) {
    console.error('Erreur création RDV agent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== ROUTES ADMIN ÉTABLISSEMENT =====

// CONFIGURER RDV D'UN SERVICE (remplace l'ancienne génération manuelle)
// L'admin configure une seule fois, les créneaux se génèrent automatiquement
exports.configurerRDVService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { duree_creneau, jours, heure_debut, heure_fin, pause_debut, pause_fin } = req.body;

    const service = await Service.findOne({ _id: serviceId, etablissement: req.user.etablissement_id });
    if (!service) return res.status(404).json({ success: false, message: 'Service non trouvé.' });

    const exceptions = service.config_rdv?.exceptions || [];

    service.rdv_active = true;
    service.config_rdv = {
      duree_creneau: duree_creneau || 30,
      jours: jours || ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
      heure_debut: heure_debut || '08:00',
      heure_fin: heure_fin || '17:00',
      pause_debut: pause_debut || '',
      pause_fin: pause_fin || '',
      exceptions // préserver les exceptions existantes
    };

    await service.save();

    // Supprimer les créneaux libres d'aujourd'hui et futurs pour forcer la régénération avec la nouvelle config
    const debutAujourdhui = new Date();
    debutAujourdhui.setHours(0, 0, 0, 0);
    await Creneau.deleteMany({
      service: serviceId,
      date: { $gte: debutAujourdhui },
      statut: 'libre'
    });

    res.json({
      success: true,
      message: 'Configuration enregistrée ! Les créneaux seront générés automatiquement à la demande.',
      data: service
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// AJOUTER EXCEPTION (jour férié, fermeture, fin anticipée)
exports.ajouterException = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const {
      date,
      date_fin,         // optionnel — si absent = 1 seul jour
      type = 'ferme',
      heure_debut_exceptionnelle,
      heure_fin_exceptionnelle,
      raison
    } = req.body;

    if (!date) return res.status(400).json({ success: false, message: 'Date requise.' });

    const service = await Service.findOne({ _id: serviceId, etablissement: req.user.etablissement_id });
    if (!service) return res.status(404).json({ success: false, message: 'Service non trouvé.' });
    if (!service.config_rdv) return res.status(400).json({ success: false, message: 'Configurez d\'abord les RDV du service.' });

    const startStr = new Date(date).toISOString().split('T')[0];
    const endStr = date_fin ? new Date(date_fin).toISOString().split('T')[0] : startStr;

    // Supprimer toute exception qui chevauche la nouvelle plage
    service.config_rdv.exceptions = (service.config_rdv.exceptions || []).filter(e => {
      const eStart = new Date(e.date).toISOString().split('T')[0];
      const eEnd = e.date_fin ? new Date(e.date_fin).toISOString().split('T')[0] : eStart;
      // Garder seulement les exceptions qui ne chevauchent pas
      return eEnd < startStr || eStart > endStr;
    });

    service.config_rdv.exceptions.push({
      date: new Date(date),
      date_fin: date_fin ? new Date(date_fin) : undefined,
      type,
      heure_debut_exceptionnelle: type === 'horaire_modifie' ? (heure_debut_exceptionnelle || undefined) : undefined,
      heure_fin_exceptionnelle: type === 'horaire_modifie' ? (heure_fin_exceptionnelle || undefined) : undefined,
      raison
    });

    service.markModified('config_rdv');
    await service.save();

    // ── Notifier par WhatsApp les clients avec RDV confirmés sur cette plage ──
    try {
      const plageDebutNotif = new Date(date); plageDebutNotif.setHours(0, 0, 0, 0);
      const plageFinNotif = date_fin ? new Date(date_fin) : new Date(date);
      plageFinNotif.setHours(23, 59, 59, 999);

      // Trouver les créneaux occupés sur la plage
      const creneauxImpactes = await Creneau.find({
        service: serviceId,
        date: { $gte: plageDebutNotif, $lte: plageFinNotif },
        statut: 'occupe'
      });

      if (creneauxImpactes.length > 0) {
        const creneauxIds = creneauxImpactes.map(c => c._id);

        // Trouver les RDVs confirmés liés à ces créneaux
        const rdvsImpactes = await RendezVous.find({
          creneaux: { $in: creneauxIds },
          statut: 'a_venir'
        }).populate('citoyen', 'prenom nom telephone')
          .populate('creneaux', 'date heure_debut')
          .populate('service', 'nom')
          .populate('etablissement', 'nom');

        // Envoyer WhatsApp à chaque client (sans await pour ne pas bloquer la réponse)
        const dateFormatted = new Date(date).toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        for (const rdv of rdvsImpactes) {
          if (!rdv.citoyen?.telephone) continue;
          const heure = rdv.creneaux?.[0]?.heure_debut || '';
          const serviceName = rdv.service?.nom || service.nom;
          const etablissementName = rdv.etablissement?.nom || '';

          if (type === 'ferme') {
            sendRdvFermetureExceptionnelle(
              rdv.citoyen.telephone,
              rdv.citoyen.prenom,
              serviceName,
              etablissementName,
              dateFormatted,
              heure,
              raison
            ).catch(() => {});
          } else {
            sendRdvHoraireModifie(
              rdv.citoyen.telephone,
              rdv.citoyen.prenom,
              serviceName,
              etablissementName,
              dateFormatted,
              heure,
              heure_debut_exceptionnelle,
              heure_fin_exceptionnelle,
              raison
            ).catch(() => {});
          }
        }
      }
    } catch (notifErr) {
      // Ne pas bloquer la réponse si la notification échoue
      console.error('Erreur notification WhatsApp exception:', notifErr.message);
    }

    // Supprimer les créneaux libres déjà générés sur toute la plage
    const plageDebut = new Date(date); plageDebut.setHours(0, 0, 0, 0);
    const plageFin = date_fin ? new Date(date_fin) : new Date(date);
    plageFin.setHours(23, 59, 59, 999);

    const deleted = await Creneau.deleteMany({
      service: serviceId,
      date: { $gte: plageDebut, $lte: plageFin },
      statut: 'libre'
    });

    // Pour horaire_modifie : régénérer immédiatement avec les nouveaux horaires
    let regeneres = 0;
    if (type === 'horaire_modifie') {
      const agents = await User.find({ service_id: serviceId, role: 'agent', statut: 'actif' });
      if (agents.length > 0) {
        const cursor = new Date(plageDebut);
        while (cursor <= plageFin) {
          const dayDebut = new Date(cursor); dayDebut.setHours(0, 0, 0, 0);
          const slots = genererSlotsPourDate(service.config_rdv, dayDebut);
          if (slots && slots.length > 0) {
            const aCreer = [];
            for (const agent of agents) {
              const cal = await Calendrier.findOneAndUpdate(
                { agent: agent._id, service: serviceId },
                { duree_rdv_defaut: service.config_rdv.duree_creneau },
                { upsert: true, new: true }
              );
              for (const slot of slots) {
                aCreer.push({
                  calendrier: cal._id, service: serviceId, date: dayDebut,
                  heure_debut: slot.heure_debut, heure_fin: slot.heure_fin,
                  duree_minutes: service.config_rdv.duree_creneau || 30, statut: 'libre'
                });
              }
            }
            if (aCreer.length > 0) {
              await Creneau.insertMany(aCreer);
              regeneres += aCreer.length / agents.length;
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    const nbJours = date_fin
      ? Math.round((plageFin - plageDebut) / (1000 * 60 * 60 * 24)) + 1
      : 1;

    res.json({
      success: true,
      message: type === 'ferme'
        ? `${nbJours} jour(s) marqué(s) fermé(s). ${deleted.deletedCount} créneau(x) supprimé(s).`
        : `Horaires modifiés sur ${nbJours} jour(s). ${deleted.deletedCount} supprimé(s), ${regeneres} régénéré(s).`,
      data: service.config_rdv.exceptions
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// SUPPRIMER EXCEPTION (par date de début)
exports.supprimerException = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { date } = req.body;

    const service = await Service.findOne({ _id: serviceId, etablissement: req.user.etablissement_id });
    if (!service || !service.config_rdv) return res.status(404).json({ success: false, message: 'Non trouvé.' });

    const dateStr = new Date(date).toISOString().split('T')[0];
    service.config_rdv.exceptions = (service.config_rdv.exceptions || []).filter(
      e => new Date(e.date).toISOString().split('T')[0] !== dateStr
    );
    service.markModified('config_rdv');
    await service.save();

    res.json({ success: true, message: 'Exception supprimée.' });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ANCIENNE ROUTE HORAIRES (maintenu pour compatibilité — redirige vers configurerRDVService)
exports.configurerHorairesService = exports.configurerRDVService;

// ANCIENNE ROUTE GÉNÉRATION MANUELLE (maintenu pour compatibilité)
exports.genererCreneaux = async (req, res) => {
  return res.json({
    success: true,
    message: 'La génération manuelle n\'est plus nécessaire. Les créneaux se génèrent automatiquement selon la configuration du service.'
  });
};

// LISTER LES CRÉNEAUX D'UN SERVICE (vue admin)
exports.creneauxService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { date_debut, date_fin } = req.query;

    const service = await Service.findOne({ _id: serviceId, etablissement: req.user.etablissement_id });
    if (!service) return res.status(404).json({ success: false, message: 'Service non trouvé.' });

    const debut = date_debut ? new Date(date_debut) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const fin = date_fin ? new Date(date_fin) : (() => { const d = new Date(); d.setDate(d.getDate() + 14); d.setHours(23,59,59,999); return d; })();

    // Auto-génération : si config_rdv définie, générer tous les jours manquants dans la plage
    if (service.config_rdv) {
      const agents = await User.find({ service_id: serviceId, role: 'agent', statut: 'actif' });
      if (agents.length > 0) {
        const cursor = new Date(debut);
        while (cursor <= fin) {
          const dayDebut = new Date(cursor); dayDebut.setHours(0, 0, 0, 0);
          const dayFin = new Date(cursor); dayFin.setHours(23, 59, 59, 999);

          const existing = await Creneau.countDocuments({ service: serviceId, date: { $gte: dayDebut, $lte: dayFin } });
          if (existing === 0) {
            const slots = genererSlotsPourDate(service.config_rdv, dayDebut);
            if (slots && slots.length > 0) {
              const aCreer = [];
              for (const agent of agents) {
                const cal = await Calendrier.findOneAndUpdate(
                  { agent: agent._id, service: serviceId },
                  { duree_rdv_defaut: service.config_rdv.duree_creneau },
                  { upsert: true, new: true }
                );
                for (const slot of slots) {
                  aCreer.push({ calendrier: cal._id, service: serviceId, date: dayDebut, heure_debut: slot.heure_debut, heure_fin: slot.heure_fin, duree_minutes: service.config_rdv.duree_creneau || 30, statut: 'libre' });
                }
              }
              if (aCreer.length > 0) await Creneau.insertMany(aCreer);
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    const creneaux = await Creneau.find({ service: serviceId, date: { $gte: debut, $lte: fin } })
      .sort({ date: 1, heure_debut: 1 });

    const grouped = creneaux.reduce((acc, c) => {
      const dateStr = c.date.toISOString().split('T')[0];
      if (!acc[dateStr]) acc[dateStr] = { libre: 0, occupe: 0, bloque: 0, total: 0 };
      acc[dateStr][c.statut]++;
      acc[dateStr].total++;
      return acc;
    }, {});

    res.json({
      success: true,
      data: { creneaux, resume: grouped, total: creneaux.length, config_rdv: service.config_rdv }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
