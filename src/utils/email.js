const nodemailer = require('nodemailer');

// Créer le transporteur
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true pour 465, false pour les autres ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Vérifier la connexion
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Erreur configuration email:', error);
  } else {
    console.log('✅ Serveur email prêt');
  }
});

// Fonction pour envoyer un email
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

// Template email reset password
const sendResetPasswordEmail = async (to, resetUrl, prenom) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 8px;
          margin: 20px 0;
          font-weight: bold;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>FileZen</h1>
          <p>Réinitialisation de mot de passe</p>
        </div>
        <div class="content">
          <p>Bonjour ${prenom},</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe FileZen.</p>
          <p>Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :</p>
          <center>
            <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
          </center>
          <p><strong>Ce lien est valide pendant 1 heure.</strong></p>
          <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
          <p>Cordialement,<br>L'équipe FileZen</p>
        </div>
        <div class="footer">
          <p>© 2026 FileZen. Tous droits réservés.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, 'Réinitialisation de votre mot de passe FileZen', html);
};

// Template email verification code
const sendVerificationCodeEmail = async (to, code, prenom) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        }
        .code {
          background: white;
          border: 2px dashed #2563eb;
          padding: 20px;
          text-align: center;
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          color: #2563eb;
          margin: 20px 0;
          border-radius: 8px;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>FileZen</h1>
          <p>Vérification de votre compte</p>
        </div>
        <div class="content">
          <p>Bonjour ${prenom},</p>
          <p>Merci de vous être inscrit sur FileZen !</p>
          <p>Voici votre code de vérification :</p>
          <div class="code">${code}</div>
          <p><strong>Ce code est valide pendant 10 minutes.</strong></p>
          <p>Entrez ce code sur la page de vérification pour activer votre compte.</p>
          <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
          <p>Cordialement,<br>L'équipe FileZen</p>
        </div>
        <div class="footer">
          <p>© 2026 FileZen. Tous droits réservés.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, 'Vérifiez votre compte FileZen', html);
};

module.exports = {
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationCodeEmail,
};