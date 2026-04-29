const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client = null;
let isReady = false;

function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
  });

  client.on('qr', (qr) => {
    console.log('\n========================================');
    console.log('📱 SCANNEZ CE QR CODE AVEC WHATSAPP :');
    console.log('========================================\n');
    qrcode.generate(qr, { small: true });
    console.log('\n(Ouvrez WhatsApp → Menu → Appareils connectés → Connecter un appareil)\n');
  });

  client.on('ready', () => {
    isReady = true;
    console.log('✅ WhatsApp connecté et prêt !');
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    console.warn('⚠️ WhatsApp déconnecté :', reason);
    // Reconnexion automatique après 10s
    setTimeout(() => initWhatsApp(), 10000);
  });

  client.on('auth_failure', () => {
    isReady = false;
    console.error('❌ Échec authentification WhatsApp — supprimez .wwebjs_auth et redémarrez');
  });

  client.initialize().catch(err => {
    console.error('❌ Erreur init WhatsApp:', err.message);
  });
}

// Démarrer WhatsApp au chargement du module
initWhatsApp();

// Formater numéro tunisien → format WhatsApp (216XXXXXXXX@c.us)
function formatTunisianPhone(phone) {
  if (!phone) return null;
  const clean = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  let number = '';
  if (clean.startsWith('+216')) number = clean.slice(1); // enlever +
  else if (clean.startsWith('216')) number = clean;
  else if (clean.length === 8) number = `216${clean}`;
  else return null;
  return `${number}@c.us`;
}

async function sendWhatsApp(telephone, message) {
  const to = formatTunisianPhone(telephone);
  if (!to) {
    console.warn('⚠️ Numéro WhatsApp invalide:', telephone);
    return;
  }

  if (!isReady || !client) {
    console.warn('⚠️ WhatsApp pas encore prêt — message non envoyé à', to);
    return;
  }

  try {
    await client.sendMessage(to, message);
    console.log(`✅ WhatsApp envoyé à ${to}`);
  } catch (err) {
    console.error(`❌ WhatsApp erreur (${to}):`, err.message);
  }
}

// ── Messages file d'attente ──────────────────────────────────

async function sendQueueBientotVotreTour(telephone, prenom, numero, service, etablissement, nombreAvant) {
  const msg =
    `📋 *FileZen — Bientôt votre tour !*\n\n` +
    `Bonjour ${prenom},\n\n` +
    `Il ne reste que *${nombreAvant} personne(s)* avant vous.\n\n` +
    `🎫 Votre ticket : *#${numero}*\n` +
    `🏢 Service : ${service}\n` +
    `📍 Établissement : ${etablissement}\n\n` +
    `Préparez-vous et approchez-vous de l'accueil ! 🚶`;
  return sendWhatsApp(telephone, msg);
}

async function sendQueueVotreTour(telephone, prenom, numero, guichet, service, etablissement) {
  const msg =
    `🔔 *FileZen — C'est votre tour !*\n\n` +
    `Bonjour ${prenom},\n\n` +
    `Votre ticket *#${numero}* est appelé !\n\n` +
    `🪟 Présentez-vous au *guichet ${guichet || 1}*\n` +
    `🏢 Service : ${service}\n` +
    `📍 Établissement : ${etablissement}\n\n` +
    `Dépêchez-vous, votre tour ne durera pas longtemps ! ⏱️`;
  return sendWhatsApp(telephone, msg);
}

// ── Messages rendez-vous ─────────────────────────────────────

async function sendRdvRappel24h(telephone, prenom, service, etablissement, date, heure) {
  const msg =
    `📅 *FileZen — Rappel RDV demain*\n\n` +
    `Bonjour ${prenom},\n\n` +
    `Vous avez un rendez-vous *demain* :\n\n` +
    `🏢 ${etablissement}\n` +
    `🔧 Service : ${service}\n` +
    `📆 Date : ${date}\n` +
    `🕐 Heure : ${heure}\n\n` +
    `N'oubliez pas d'apporter vos documents nécessaires.\n` +
    `Pour annuler, connectez-vous sur FileZen.`;
  return sendWhatsApp(telephone, msg);
}

async function sendRdvRappel1h(telephone, prenom, service, etablissement, heure, adresse) {
  const msg =
    `⏰ *FileZen — Votre RDV dans 1 heure !*\n\n` +
    `Bonjour ${prenom},\n\n` +
    `Votre rendez-vous est dans *1 heure* :\n\n` +
    `🏢 ${etablissement}\n` +
    `🔧 Service : ${service}\n` +
    `🕐 À ${heure}\n` +
    `📍 ${adresse}\n\n` +
    `Bonne chance ! 💪`;
  return sendWhatsApp(telephone, msg);
}

async function sendRdvFermetureExceptionnelle(telephone, prenom, service, etablissement, date, heure, raison) {
  const msg =
    `🔒 *FileZen — Fermeture exceptionnelle*\n\n` +
    `Bonjour ${prenom},\n\n` +
    `Nous vous informons que *${etablissement}* sera exceptionnellement *fermé* le *${date}*.\n\n` +
    `Votre rendez-vous à *${heure}* (${service}) ne pourra malheureusement pas avoir lieu.` +
    (raison ? `\n\n📌 Motif : ${raison}` : '') +
    `\n\nVeuillez vous connecter sur *FileZen* pour reprogrammer votre rendez-vous à votre convenance.\n\n` +
    `Nous nous excusons sincèrement pour la gêne occasionnée. 🙏`;
  return sendWhatsApp(telephone, msg);
}

async function sendRdvHoraireModifie(telephone, prenom, service, etablissement, date, heure, heureDebutExc, heureFinExc, raison) {
  const nouvelHoraire = heureDebutExc && heureFinExc
    ? `${heureDebutExc} – ${heureFinExc}`
    : heureDebutExc ? `à partir de ${heureDebutExc}` : heureFinExc ? `jusqu'à ${heureFinExc}` : 'modifiés';
  const msg =
    `⏰ *FileZen — Horaires modifiés*\n\n` +
    `Bonjour ${prenom},\n\n` +
    `Les horaires de *${etablissement}* seront exceptionnellement modifiés le *${date}*.\n\n` +
    `Votre rendez-vous à *${heure}* (${service}) pourrait être impacté.\n` +
    `🕐 Nouveaux horaires ce jour : *${nouvelHoraire}*` +
    (raison ? `\n📌 Motif : ${raison}` : '') +
    `\n\nConnectez-vous sur *FileZen* pour vérifier ou reprogrammer votre rendez-vous.\n\n` +
    `Merci de votre compréhension. 🙏`;
  return sendWhatsApp(telephone, msg);
}

module.exports = {
  sendWhatsApp,
  sendQueueBientotVotreTour,
  sendQueueVotreTour,
  sendRdvRappel24h,
  sendRdvRappel1h,
  sendRdvFermetureExceptionnelle,
  sendRdvHoraireModifie,
};
