const cron = require('node-cron');
const mongoose = require('mongoose');
const whatsapp = require('../utils/whatsapp');
const { sendRdvRappel24hEmail, sendRdvRappel1hEmail } = require('../utils/email');

// Lancer les jobs de rappels RDV
function startReminderJobs() {

  // ── Rappel 24h avant le RDV ────────────────────────────────
  // Tourne toutes les 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const RendezVous = mongoose.model('RendezVous');

      const maintenant = new Date();
      const dans24h = new Date(maintenant.getTime() + 24 * 60 * 60 * 1000);
      const dans23h = new Date(maintenant.getTime() + 23 * 60 * 60 * 1000);

      const rdvs = await RendezVous.find({
        statut: 'confirme',
        rappels_actives: true,
        rappel_24h_envoye: false
      })
        .populate('citoyen', 'prenom nom telephone email')
        .populate('service', 'nom')
        .populate('etablissement', 'nom adresse')
        .populate('creneaux');

      for (const rdv of rdvs) {
        if (!rdv.creneaux?.length) continue;

        const premierCreneau = rdv.creneaux.sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        )[0];
        if (!premierCreneau) continue;

        const dateRdv = new Date(premierCreneau.date);
        const [h, m] = (premierCreneau.heure_debut || '00:00').split(':').map(Number);
        dateRdv.setHours(h, m, 0, 0);

        if (dateRdv >= dans23h && dateRdv <= dans24h) {
          const prenom = rdv.citoyen?.prenom || rdv.nom_patient || 'Client';
          const telephone = rdv.citoyen?.telephone || rdv.telephone_patient;
          const email = rdv.citoyen?.email;
          const serviceNom = rdv.service?.nom || 'Service';
          const etablissementNom = rdv.etablissement?.nom || 'Établissement';
          const dateStr = dateRdv.toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long'
          });
          const heure = premierCreneau.heure_debut;

          // WhatsApp si numéro disponible
          if (telephone) {
            await whatsapp.sendRdvRappel24h(
              telephone, prenom, serviceNom, etablissementNom, dateStr, heure
            );
          }

          // Email si citoyen avec compte
          if (email) {
            await sendRdvRappel24hEmail(
              email, prenom, serviceNom, etablissementNom, dateStr, heure
            );
          }

          await RendezVous.findByIdAndUpdate(rdv._id, { rappel_24h_envoye: true });
          console.log(`📅 Rappel 24h envoyé pour RDV ${rdv._id} (${prenom})`);
        }
      }
    } catch (err) {
      console.error('❌ Erreur cron rappel 24h:', err.message);
    }
  });

  // ── Rappel 1h avant le RDV ─────────────────────────────────
  // Tourne toutes les 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      const RendezVous = mongoose.model('RendezVous');

      const maintenant = new Date();
      const dans1h = new Date(maintenant.getTime() + 60 * 60 * 1000);
      const dans50min = new Date(maintenant.getTime() + 50 * 60 * 1000);

      const rdvs = await RendezVous.find({
        statut: 'confirme',
        rappels_actives: true,
        rappel_1h_envoye: false
      })
        .populate('citoyen', 'prenom nom telephone email')
        .populate('service', 'nom')
        .populate('etablissement', 'nom adresse')
        .populate('creneaux');

      for (const rdv of rdvs) {
        if (!rdv.creneaux?.length) continue;

        const premierCreneau = rdv.creneaux.sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        )[0];
        if (!premierCreneau) continue;

        const dateRdv = new Date(premierCreneau.date);
        const [h, m] = (premierCreneau.heure_debut || '00:00').split(':').map(Number);
        dateRdv.setHours(h, m, 0, 0);

        if (dateRdv >= dans50min && dateRdv <= dans1h) {
          const prenom = rdv.citoyen?.prenom || rdv.nom_patient || 'Client';
          const telephone = rdv.citoyen?.telephone || rdv.telephone_patient;
          const email = rdv.citoyen?.email;
          const serviceNom = rdv.service?.nom || 'Service';
          const etablissementNom = rdv.etablissement?.nom || 'Établissement';
          const heure = premierCreneau.heure_debut;
          const adresse = rdv.etablissement?.adresse || '';

          // WhatsApp
          if (telephone) {
            await whatsapp.sendRdvRappel1h(
              telephone, prenom, serviceNom, etablissementNom, heure, adresse
            );
          }

          // Email
          if (email) {
            await sendRdvRappel1hEmail(
              email, prenom, serviceNom, etablissementNom, heure, adresse
            );
          }

          await RendezVous.findByIdAndUpdate(rdv._id, { rappel_1h_envoye: true });
          console.log(`⏰ Rappel 1h envoyé pour RDV ${rdv._id} (${prenom})`);
        }
      }
    } catch (err) {
      console.error('❌ Erreur cron rappel 1h:', err.message);
    }
  });

  console.log('⏰ Jobs de rappels RDV démarrés (24h toutes les 30min + 1h toutes les 10min)');
  console.log('   📧 Email + 📱 WhatsApp pour chaque rappel');
}

module.exports = { startReminderJobs };
