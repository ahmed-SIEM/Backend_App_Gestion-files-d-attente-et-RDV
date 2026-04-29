const crypto = require('crypto');
const { User } = require('../models');
const { Etablissement } = require('../models');
const { sendAgentInviteEmail } = require('../utils/email');

// CRÉER UN AGENT (Admin Établissement) — envoie un lien d'invitation sécurisé
exports.creerAgent = async (req, res) => {
  try {
    const { email, telephone, prenom, nom, service_id, numero_guichet } = req.body;

    const existant = await User.findOne({ email });
    if (existant) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé.'
      });
    }

    // Générer un token d'invitation sécurisé
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    // Mot de passe temporaire aléatoire (jamais partagé — l'agent va le remplacer)
    const tempPassword = crypto.randomBytes(20).toString('hex');

    const agent = await User.create({
      email,
      telephone: telephone || '00000000',
      mot_de_passe: tempPassword,
      role: 'agent',
      prenom,
      nom,
      etablissement_id: req.user.etablissement_id,
      service_id: service_id || null,
      numero_guichet: numero_guichet || null,
      statut: 'en_attente',
      email_verified: true,
      invitation_token: hashedToken,
      invitation_token_expire: expiration,
      invitation_acceptee: false,
    });

    // Construire le lien d'invitation
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationUrl = `${frontendUrl}/agent-setup/${rawToken}`;

    // Récupérer le nom de l'établissement
    let nomEtablissement = '';
    try {
      const etab = await Etablissement.findById(req.user.etablissement_id).select('nom');
      nomEtablissement = etab?.nom || '';
    } catch (_) {}

    try {
      await sendAgentInviteEmail(
        email,
        prenom,
        invitationUrl,
        req.user.nom_complet || `${req.user.prenom} ${req.user.nom}`,
        nomEtablissement
      );
    } catch (emailError) {
      console.error('Erreur envoi email invitation agent:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Invitation envoyée ! L\'agent recevra un email pour créer son mot de passe.',
      data: agent
    });

  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'agent.',
      error: error.message
    });
  }
};

// LISTER MES AGENTS (Admin Établissement)
exports.mesAgents = async (req, res) => {
  try {
    const agents = await User.find({
      etablissement_id: req.user.etablissement_id,
      role: 'agent'
    })
    .populate('service_id', 'nom')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: agents.length,
      data: agents
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des agents.',
      error: error.message
    });
  }
};

// MODIFIER AGENT (Admin Établissement)
exports.modifierAgent = async (req, res) => {
  try {
    const { service_id, numero_guichet, statut, prenom, nom, telephone } = req.body;

    const updateData = { numero_guichet, statut };
    if (service_id !== undefined) updateData.service_id = service_id;
    if (prenom) updateData.prenom = prenom;
    if (nom) updateData.nom = nom;
    if (telephone) updateData.telephone = telephone;

    const agent = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        etablissement_id: req.user.etablissement_id,
        role: 'agent'
      },
      updateData,
      { new: true, runValidators: true }
    ).populate('service_id', 'nom');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent non trouvé.'
      });
    }

    res.json({
      success: true,
      message: 'Agent modifié avec succès !',
      data: agent
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification.',
      error: error.message
    });
  }
};

// SUPPRIMER AGENT (Admin Établissement)
exports.supprimerAgent = async (req, res) => {
  try {
    const agent = await User.findOneAndDelete({
      _id: req.params.id,
      etablissement_id: req.user.etablissement_id,
      role: 'agent'
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent non trouvé.'
      });
    }

    res.json({
      success: true,
      message: 'Agent supprimé avec succès !'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression.',
      error: error.message
    });
  }
};

// ASSIGNER SERVICE À UN AGENT
exports.assignerService = async (req, res) => {
  try {
    const { service_id } = req.body;

    const agent = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        etablissement_id: req.user.etablissement_id,
        role: 'agent'
      },
      { service_id: service_id || null },
      { new: true }
    ).populate('service_id', 'nom');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent non trouvé.'
      });
    }

    res.json({
      success: true,
      message: 'Service assigné avec succès !',
      data: agent
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation.',
      error: error.message
    });
  }
};
