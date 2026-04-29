const { Etablissement, User } = require('../models');
const { sendApprovalEmail, sendRejectionEmail } = require('../utils/email');
const { creerNotification } = require('../utils/notification');

// Seuil signalements avant alerte super admin
const SEUIL_SIGNALEMENTS = 5;

// UPLOAD DOCUMENTS (Cloudinary)
exports.uploadDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun fichier reçu.' });
    }

    const docs = req.files.map(file => ({
      nom: file.originalname,
      type: file.mimetype,
      url: file.path, // Cloudinary URL
      date_upload: new Date()
    }));

    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// UPLOAD PHOTO ÉTABLISSEMENT (Cloudinary)
exports.uploadPhotoEtablissement = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune photo reçue.' });
    }

    const etablissement = await Etablissement.findByIdAndUpdate(
      req.user.etablissement_id,
      { photo: req.file.path },
      { new: true }
    );

    res.json({ success: true, data: etablissement, photo_url: req.file.path });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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
    const etablissement = await Etablissement.findById(req.user.etablissement_id)
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

// ⭐ MODIFIER ÉTABLISSEMENT (avec horaires)
exports.modifierEtablissement = async (req, res) => {
  try {
    const { 
      nom, 
      description, 
      telephone_etablissement, 
      email_etablissement, 
      site_web,
      horaires 
    } = req.body;
    
    const updateData = {
      nom,
      description,
      telephone_etablissement,
      email_etablissement,
      site_web
    };
    
    // Si horaires fournis, les mettre à jour
    if (horaires) {
      updateData.horaires = horaires;
    }
    
    const etablissement = await Etablissement.findByIdAndUpdate(
      req.user.etablissement_id,
      updateData,
      { returnDocument: "after", runValidators: true }
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

// TOUS LES ÉTABLISSEMENTS (super-admin)
exports.tousLesEtablissements = async (req, res) => {
  try {
    const { statut } = req.query;
    const filtres = statut ? { statut } : {};

    const etablissements = await Etablissement.find(filtres)
      .populate('admin', 'nom_complet email telephone')
      .sort({ createdAt: -1 });

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
      { returnDocument: "after" }
    );
    
    if (!etablissement) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement non trouvé.' 
      });
    }
    
    // Envoyer email + notification à l'admin
    try {
      const admin = await User.findById(etablissement.admin);
      if (admin) {
        await sendApprovalEmail(admin.email, admin.nom_complet, etablissement.nom);
        await User.findByIdAndUpdate(admin._id, { statut: 'actif' });
        await creerNotification({
          destinataire: admin._id,
          type: 'etablissement_valide',
          titre: '🎉 Établissement approuvé !',
          message: `Votre établissement "${etablissement.nom}" a été validé. Vous pouvez maintenant vous connecter et configurer vos services.`,
          lien: '/admin/dashboard'
        });
      }
    } catch (emailError) {
      console.error('Erreur envoi email approbation:', emailError);
    }

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
      { returnDocument: "after" }
    );
    
    if (!etablissement) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement non trouvé.' 
      });
    }
    
    // Envoyer email + notification de rejet à l'admin
    try {
      const admin = await User.findById(etablissement.admin);
      if (admin) {
        await sendRejectionEmail(admin.email, admin.nom_complet, etablissement.nom, raison);
        await creerNotification({
          destinataire: admin._id,
          type: 'etablissement_rejete',
          titre: '❌ Demande rejetée',
          message: `Votre demande pour "${etablissement.nom}" a été rejetée.${raison ? ` Raison : ${raison}` : ''} Vous pouvez soumettre une nouvelle demande.`,
          lien: '/signup/etablissement'
        });
      }
    } catch (emailError) {
      console.error('Erreur envoi email rejet:', emailError);
    }

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
      { statut: 'suspendu', raison_rejet: raison },
      { returnDocument: "after" }
    );

    try {
      const admin = await User.findById(etablissement.admin);
      if (admin) {
        await creerNotification({
          destinataire: admin._id,
          type: 'etablissement_suspendu',
          titre: '⚠️ Établissement suspendu',
          message: `Votre établissement "${etablissement.nom}" a été suspendu.${raison ? ` Raison : ${raison}` : ''} Contactez le support pour plus d'informations.`,
          lien: '/admin/dashboard'
        });
      }
    } catch (e) { console.error('Notif suspension:', e.message); }

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

// ACTIVER ÉTABLISSEMENT
exports.activerEtablissement = async (req, res) => {
  try {
    const etablissement = await Etablissement.findByIdAndUpdate(
      req.params.id,
      { statut: 'actif' },
      { returnDocument: "after" }
    );

    if (!etablissement) {
      return res.status(404).json({
        success: false,
        message: 'Établissement non trouvé.'
      });
    }

    res.json({
      success: true,
      message: 'Établissement activé.',
      data: etablissement
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'activation.',
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

// ============================================
// SIGNALEMENT ÉTABLISSEMENT (CITOYEN)
// ============================================
exports.signalerEtablissement = async (req, res) => {
  try {
    const { id } = req.params;
    const { raison, commentaire } = req.body;

    if (!raison) {
      return res.status(400).json({ success: false, message: 'Raison du signalement requise.' });
    }

    const etablissement = await Etablissement.findById(id);
    if (!etablissement || etablissement.statut !== 'actif') {
      return res.status(404).json({ success: false, message: 'Établissement non trouvé.' });
    }

    // 1 signalement par citoyen
    const dejaSignale = etablissement.signalements.some(
      s => s.citoyen?.toString() === req.user._id.toString()
    );
    if (dejaSignale) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà signalé cet établissement.' });
    }

    etablissement.signalements.push({
      citoyen: req.user._id,
      raison,
      commentaire: commentaire || undefined,
      date: new Date()
    });
    etablissement.nb_signalements = etablissement.signalements.length;

    // Alerte super admin au seuil (5 signalements)
    if (etablissement.nb_signalements >= SEUIL_SIGNALEMENTS && !etablissement.alerte_signalement_envoyee) {
      etablissement.alerte_signalement_envoyee = true;
      await etablissement.save();

      const superAdmins = await User.find({ role: 'super_admin' });
      for (const admin of superAdmins) {
        await creerNotification({
          destinataire: admin._id,
          titre: '🚨 Alerte signalements',
          message: `L'établissement "${etablissement.nom}" a reçu ${etablissement.nb_signalements} signalements. Une action est requise.`,
          type: 'alerte',
          lien: `/superadmin/etablissements/${etablissement._id}/signalements`
        });
      }
      console.log(`🚨 Seuil signalements atteint pour ${etablissement.nom}`);
    } else {
      await etablissement.save();
    }

    res.json({
      success: true,
      message: 'Signalement enregistré. Merci pour votre retour.',
      data: { nb_signalements: etablissement.nb_signalements }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// LISTE SIGNALEMENTS D'UN ÉTABLISSEMENT (SUPER ADMIN)
exports.signalementsEtablissement = async (req, res) => {
  try {
    const etablissement = await Etablissement.findById(req.params.id)
      .populate('signalements.citoyen', 'prenom nom email');

    if (!etablissement) return res.status(404).json({ success: false, message: 'Non trouvé.' });

    const signalements = [...etablissement.signalements]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: {
        etablissement: { _id: etablissement._id, nom: etablissement.nom, statut: etablissement.statut },
        nb_signalements: etablissement.nb_signalements,
        signalements
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// TOUS LES ÉTABLISSEMENTS SIGNALÉS (SUPER ADMIN)
exports.etablissementsSignales = async (req, res) => {
  try {
    const etablissements = await Etablissement.find({ nb_signalements: { $gt: 0 } })
      .select('nom type gouvernorat statut nb_signalements alerte_signalement_envoyee photo')
      .sort({ nb_signalements: -1 });

    res.json({ success: true, count: etablissements.length, data: etablissements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// RÉINITIALISER SIGNALEMENTS (SUPER ADMIN — après action)
exports.reinitialiserSignalements = async (req, res) => {
  try {
    await Etablissement.findByIdAndUpdate(req.params.id, {
      signalements: [],
      nb_signalements: 0,
      alerte_signalement_envoyee: false
    });
    res.json({ success: true, message: 'Signalements réinitialisés.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};