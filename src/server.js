const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const httpServer = http.createServer(app);

// Initialiser Socket.io
const socketUtil = require('./utils/socket');
socketUtil.init(httpServer);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers uploadés statiquement
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Route de test
app.get('/', (req, res) => {
  res.json({
    message: '🎉 Bienvenue sur FileZen API !',
    status: 'Backend fonctionne parfaitement ✅',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API fonctionne !', data: { version: '1.0.0' } });
});

// ===== ROUTES API =====
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/etablissements', require('./routes/etablissement.routes'));
app.use('/api/services', require('./routes/service.routes'));
app.use('/api/tickets', require('./routes/ticket.routes'));
app.use('/api/rendezvous', require('./routes/rendezvous.routes'));
app.use('/api/creneaux', require('./routes/creneau.routes'));
app.use('/api/agents', require('./routes/agent.routes'));
app.use('/api/stats', require('./routes/stats.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));

// Connexion MongoDB + démarrer les jobs après connexion
const { startReminderJobs } = require('./jobs/reminders.job');
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('✅ MongoDB connecté');
    startReminderJobs();
  })
  .catch(err => console.error('❌ Erreur MongoDB:', err.message));

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route non trouvée' });
});

// Démarrer le serveur (httpServer au lieu de app.listen)
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log('================================');
  console.log(`🚀 Serveur FileZen démarré !`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`⚙️  Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Socket.io activé`);
  console.log('================================');
});
