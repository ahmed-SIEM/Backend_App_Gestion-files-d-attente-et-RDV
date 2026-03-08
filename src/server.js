const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route de test
app.get('/', (req, res) => {
  res.json({ 
    message: '🎉 Bienvenue sur FileZen API !',
    status: 'Backend fonctionne parfaitement ✅',
    timestamp: new Date().toISOString()
  });
});

// Route de test API
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API fonctionne !',
    data: { version: '1.0.0' }
  });
});

// Connexion MongoDB (on fera ça plus tard quand MongoDB sera installé)
// mongoose.connect(process.env.MONGODB_URI)
//   .then(() => console.log('✅ MongoDB connecté'))
//   .catch(err => console.error('❌ Erreur MongoDB:', err));

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route non trouvée' 
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('================================');
  console.log(`🚀 Serveur FileZen démarré !`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`⚙️  Mode: ${process.env.NODE_ENV}`);
  console.log('================================');
});