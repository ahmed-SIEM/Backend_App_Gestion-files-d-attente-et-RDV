const mongoose = require('mongoose');

const fileAttenteSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
    unique: true
  },
  
  numero_actuel: {
    type: Number,
    default: 0
  },
  
  dernier_numero_genere: {
    type: Number,
    default: 0
  },
  
  en_pause: {
    type: Boolean,
    default: false
  },
  
  // Stats du jour
  tickets_servis_aujourdhui: {
    type: Number,
    default: 0
  },
  
  date_reset: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('FileAttente', fileAttenteSchema);
