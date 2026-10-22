const nodemailer = require('nodemailer');
const config = require('../config');

// Sans SMTP configuré, les e-mails sont simplement affichés dans la console.
const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 10_000, // évite de bloquer une réservation si le serveur mail ne répond pas
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

// Pied de message commun
const signature = () => `\n\n—\n${config.site.name} · ${config.site.therapist}\n${config.site.address}\n${config.site.phone} · ${config.baseUrl}`;

// html (facultatif) : version mise en forme ; text : version texte (toujours fournie)
// attachments : [{ filename, content (Buffer|string), contentType }]
// Renvoie true si l'e-mail est parti, 'console' s'il a seulement été affiché (SMTP non configuré), false en cas d'échec.
async function sendMail({ to, subject, text, html, attachments }) {
  if (!to) return false;
  const body = html ? text : text + signature();
  if (!transporter) {
    const files = attachments?.length ? `\n[pièces jointes : ${attachments.map((a) => a.filename).join(', ')}]` : '';
    console.log(`\n📧 [e-mail non envoyé — SMTP non configuré]\nÀ : ${to}\nObjet : ${subject}\n${body}${files}\n`);
    return 'console';
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, replyTo: config.site.email, to, subject, text: body, html, attachments });
    return true;
  } catch (err) {
    // Un e-mail en échec ne doit pas bloquer une réservation ou un achat
    console.error('Envoi e-mail échoué :', err.message);
    return false;
  }
}

module.exports = { sendMail };
