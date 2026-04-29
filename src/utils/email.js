const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('❌ Erreur configuration email:', error);
  } else {
    console.log('✅ Serveur email prêt');
  }
});

const sendEmail = async (to, subject, html) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    console.log('✅ Email envoyé:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    return { success: false, error: error.message };
  }
};

const baseStyle = `
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0 0 5px 0; font-size: 28px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%); color: white !important; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; font-size: 16px; }
    .success-box { background: #d1fae5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .error-box { background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .info-box { background: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .code { background: white; border: 2px dashed #2563eb; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb; margin: 20px 0; border-radius: 8px; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  </style>
`;

// Email reset password
const sendResetPasswordEmail = async (to, resetUrl, prenom) => {
  const html = `<!DOCTYPE html><html><head>${baseStyle}</head><body>
    <div class="container">
      <div class="header"><h1>FileZen</h1><p>Réinitialisation de mot de passe</p></div>
      <div class="content">
        <p>Bonjour ${prenom},</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe FileZen.</p>
        <center><a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a></center>
        <p><strong>Ce lien est valide pendant 1 heure.</strong></p>
        <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        <p>Cordialement,<br>L'équipe FileZen</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} FileZen. Tous droits réservés.</p></div>
    </div>
  </body></html>`;
  return sendEmail(to, 'Réinitialisation de votre mot de passe FileZen', html);
};

// Email code de vérification
const sendVerificationCodeEmail = async (to, code, prenom) => {
  const html = `<!DOCTYPE html><html><head>${baseStyle}</head><body>
    <div class="container">
      <div class="header"><h1>FileZen</h1><p>Vérification de votre compte</p></div>
      <div class="content">
        <p>Bonjour ${prenom},</p>
        <p>Merci de vous être inscrit sur FileZen !</p>
        <p>Voici votre code de vérification :</p>
        <div class="code">${code}</div>
        <p><strong>Ce code est valide pendant 10 minutes.</strong></p>
        <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
        <p>Cordialement,<br>L'équipe FileZen</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} FileZen. Tous droits réservés.</p></div>
    </div>
  </body></html>`;
  return sendEmail(to, 'Vérifiez votre compte FileZen', html);
};

// Email approbation établissement
const sendApprovalEmail = async (to, nomAdmin, nomEtablissement) => {
  const html = `<!DOCTYPE html><html><head>${baseStyle}</head><body>
    <div class="container">
      <div class="header"><h1>FileZen</h1><p>Demande approuvée ✅</p></div>
      <div class="content">
        <p>Bonjour ${nomAdmin},</p>
        <div class="success-box">
          <strong>🎉 Félicitations ! Votre établissement a été approuvé.</strong>
        </div>
        <p>Votre établissement <strong>${nomEtablissement}</strong> a été validé par notre équipe. Vous pouvez maintenant vous connecter à votre espace administration et commencer à configurer vos services.</p>
        <center><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">Accéder à mon espace</a></center>
        <hr class="divider">
        <p><strong>Prochaines étapes :</strong></p>
        <ol>
          <li>Connectez-vous avec votre email et mot de passe</li>
          <li>Configurez vos horaires d'ouverture</li>
          <li>Créez vos services (file d'attente / rendez-vous)</li>
          <li>Ajoutez vos agents</li>
        </ol>
        <p>Cordialement,<br>L'équipe FileZen</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} FileZen. Tous droits réservés.</p></div>
    </div>
  </body></html>`;
  return sendEmail(to, `✅ Votre établissement "${nomEtablissement}" a été approuvé - FileZen`, html);
};

// Email rejet établissement
const sendRejectionEmail = async (to, nomAdmin, nomEtablissement, raison) => {
  const html = `<!DOCTYPE html><html><head>${baseStyle}</head><body>
    <div class="container">
      <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #9333ea 100%);">
        <h1>FileZen</h1><p>Demande non approuvée</p>
      </div>
      <div class="content">
        <p>Bonjour ${nomAdmin},</p>
        <p>Nous avons examiné votre demande d'inscription pour <strong>${nomEtablissement}</strong>.</p>
        <div class="error-box">
          <strong>Votre demande n'a pas pu être approuvée.</strong>
          ${raison ? `<p style="margin-top:10px;">Raison : ${raison}</p>` : ''}
        </div>
        <p>Si vous pensez qu'il s'agit d'une erreur ou si vous souhaitez soumettre une nouvelle demande avec les informations corrigées, n'hésitez pas à nous contacter ou à re-soumettre votre dossier.</p>
        <p>Cordialement,<br>L'équipe FileZen</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} FileZen. Tous droits réservés.</p></div>
    </div>
  </body></html>`;
  return sendEmail(to, `Décision sur votre demande "${nomEtablissement}" - FileZen`, html);
};

// Email invitation agent (avec lien sécurisé)
const sendAgentInviteEmail = async (to, prenomAgent, invitationUrl, nomAdmin, nomEtablissement) => {
  const html = `<!DOCTYPE html><html><head>${baseStyle}</head><body>
    <div class="container">
      <div class="header" style="background: linear-gradient(135deg, #059669 0%, #2563eb 100%);">
        <h1>FileZen</h1><p>Vous êtes invité(e) à rejoindre FileZen !</p>
      </div>
      <div class="content">
        <p>Bonjour <strong>${prenomAgent}</strong>,</p>
        <p><strong>${nomAdmin}</strong> vous a invité(e) à rejoindre <strong>${nomEtablissement || 'leur établissement'}</strong> en tant qu'<strong>Agent</strong> sur la plateforme FileZen.</p>
        <div class="info-box">
          <strong>📧 Votre email de connexion :</strong> ${to}
        </div>
        <p>Pour finaliser votre inscription et créer votre mot de passe, cliquez sur le bouton ci-dessous :</p>
        <center><a href="${invitationUrl}" class="button">🔐 Créer mon mot de passe</a></center>
        <p style="color:#ef4444;"><strong>⏳ Ce lien est valide pendant 7 jours.</strong></p>
        <p>Si vous ne vous attendiez pas à cette invitation, ignorez cet email.</p>
        <hr class="divider">
        <p style="font-size:12px;color:#9ca3af;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
        <a href="${invitationUrl}" style="color:#2563eb;word-break:break-all;">${invitationUrl}</a></p>
        <p>Cordialement,<br>L'équipe FileZen</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} FileZen. Tous droits réservés.</p></div>
    </div>
  </body></html>`;
  return sendEmail(to, `Invitation à rejoindre FileZen — ${nomEtablissement || 'Établissement'}`, html);
};

// Email rappel RDV 24h avant
const sendRdvRappel24hEmail = async (to, prenom, service, etablissement, date, heure) => {
  const html = `<!DOCTYPE html><html><head>${baseStyle}</head><body>
    <div class="container">
      <div class="header" style="background: linear-gradient(135deg, #2563eb 0%, #059669 100%);">
        <h1>FileZen</h1><p>📅 Rappel — Votre RDV est demain</p>
      </div>
      <div class="content">
        <p>Bonjour <strong>${prenom}</strong>,</p>
        <p>Nous vous rappelons que vous avez un rendez-vous <strong>demain</strong> :</p>
        <div class="info-box" style="font-size:15px; line-height:2;">
          🏢 <strong>${etablissement}</strong><br>
          🔧 Service : <strong>${service}</strong><br>
          📆 Date : <strong>${date}</strong><br>
          🕐 Heure : <strong>${heure}</strong>
        </div>
        <p>N'oubliez pas d'apporter vos documents nécessaires.</p>
        <center><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/mes-activites" class="button">Voir mes rendez-vous</a></center>
        <p style="color:#6b7280; font-size:13px;">Pour annuler, connectez-vous sur FileZen avant votre rendez-vous.</p>
        <p>Cordialement,<br>L'équipe FileZen</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} FileZen. Tous droits réservés.</p></div>
    </div>
  </body></html>`;
  return sendEmail(to, `📅 Rappel : votre RDV demain à ${heure} — ${etablissement}`, html);
};

// Email rappel RDV 1h avant
const sendRdvRappel1hEmail = async (to, prenom, service, etablissement, heure, adresse) => {
  const html = `<!DOCTYPE html><html><head>${baseStyle}</head><body>
    <div class="container">
      <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);">
        <h1>FileZen</h1><p>⏰ Votre RDV dans 1 heure !</p>
      </div>
      <div class="content">
        <p>Bonjour <strong>${prenom}</strong>,</p>
        <p>Votre rendez-vous est dans <strong>1 heure</strong>, préparez-vous !</p>
        <div class="info-box" style="font-size:15px; line-height:2;">
          🏢 <strong>${etablissement}</strong><br>
          🔧 Service : <strong>${service}</strong><br>
          🕐 À <strong>${heure}</strong><br>
          ${adresse ? `📍 ${adresse}` : ''}
        </div>
        <p>Bonne chance ! 💪</p>
        <p>Cordialement,<br>L'équipe FileZen</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} FileZen. Tous droits réservés.</p></div>
    </div>
  </body></html>`;
  return sendEmail(to, `⏰ Rappel : votre RDV dans 1h à ${heure} — ${etablissement}`, html);
};

module.exports = {
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationCodeEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendAgentInviteEmail,
  sendRdvRappel24hEmail,
  sendRdvRappel1hEmail,
};
