const nodemailer = require('nodemailer');
const config = require('../config');

// Sans SMTP configuré, les e-mails sont simplement affichés dans la console.
const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

// Pied de message commun
const signature = () => `\n\n—\n${config.site.name} · ${config.site.therapist}\n${config.site.address}\n${config.site.phone} · ${config.baseUrl}`;

// attachments : [{ filename, content (Buffer) }]
// Renvoie true si l'e-mail est parti (ou a été affiché en développement).
async function sendMail({ to, subject, text, attachments }) {
  if (!to) return false;
  const body = text + signature();
  if (!transporter) {
    const files = attachments?.length ? `\n[pièces jointes : ${attachments.map((a) => a.filename).join(', ')}]` : '';
    console.log(`\n📧 [e-mail non envoyé — SMTP non configuré]\nÀ : ${to}\nObjet : ${subject}\n${body}${files}\n`);
    return true;
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, replyTo: config.site.email, to, subject, text: body, attachments });
    return true;
  } catch (err) {
    // Un e-mail en échec ne doit pas bloquer une réservation ou un achat
    console.error('Envoi e-mail échoué :', err.message);
    return false;
  }
}

module.exports = { sendMail };
