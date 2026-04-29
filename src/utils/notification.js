const Notification = require('../models/Notification.model');
const socketUtil = require('./socket');

/**
 * Crée une notification en base et l'envoie en temps réel via Socket.io
 */
async function creerNotification({ destinataire, type, titre, message, lien = null, meta = {} }) {
  try {
    const notif = await Notification.create({ destinataire, type, titre, message, lien, meta });

    // Émettre en temps réel si l'utilisateur est connecté (room personnelle par userId)
    const io = socketUtil.getIO();
    if (io) {
      io.to(`user:${destinataire}`).emit('notification:new', {
        _id: notif._id,
        type: notif.type,
        titre: notif.titre,
        message: notif.message,
        lien: notif.lien,
        lu: false,
        createdAt: notif.createdAt
      });
    }

    return notif;
  } catch (err) {
    console.error('Erreur création notification:', err.message);
  }
}

module.exports = { creerNotification };
