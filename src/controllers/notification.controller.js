const Notification = require('../models/Notification.model');

// GET /api/notifications — mes notifications (50 dernières)
exports.mesNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ destinataire: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const non_lues = await Notification.countDocuments({
      destinataire: req.user._id,
      lu: false
    });

    res.json({ success: true, data: notifications, non_lues });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/notifications/:id/lire — marquer une notif comme lue
exports.marquerLue = async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, destinataire: req.user._id },
      { lu: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/notifications/tout-lire — marquer toutes comme lues
exports.toutMarquerLu = async (req, res) => {
  try {
    await Notification.updateMany(
      { destinataire: req.user._id, lu: false },
      { lu: true }
    );
    res.json({ success: true, message: 'Toutes les notifications marquées comme lues.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/notifications/:id — supprimer une notif
exports.supprimer = async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, destinataire: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
