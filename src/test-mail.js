// Vérifie la configuration SMTP du .env et envoie un e-mail de test.
// Usage : npm run test-mail -- votre@adresse.fr
const nodemailer = require('nodemailer');
const config = require('./config');

const to = process.argv[2];
const { host, port, user, pass, from } = config.smtp;

(async () => {
  if (!to) {
    console.log('Usage : npm run test-mail -- votre@adresse.fr');
    process.exit(1);
  }
  if (!host) {
    console.log('✘ SMTP_HOST est vide dans .env : aucun e-mail ne peut partir.');
    console.log('  Remplissez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et SMTP_FROM (voir README, section E-mails).');
    process.exit(1);
  }
  console.log(`→ Connexion à ${host}:${port} avec l'utilisateur « ${user || '(aucun)'} »…`);
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  try {
    await transporter.verify();
    console.log('✔ Connexion et identifiants SMTP acceptés');
    const info = await transporter.sendMail({
      from, to,
      subject: `Test d'envoi — ${config.site.name}`,
      text: `Si vous lisez ce message, l'envoi d'e-mails du site fonctionne.\n\nExpéditeur configuré : ${from}`,
    });
    console.log(`✔ E-mail envoyé à ${to} (id ${info.messageId}). Vérifiez aussi les courriers indésirables.`);
  } catch (err) {
    console.log(`✘ Échec : ${err.message}`);
    if (err.code === 'EAUTH') {
      console.log('  → Identifiant ou mot de passe refusé. Avec Gmail, il faut un « mot de passe d\'application »,');
      console.log('    pas votre mot de passe habituel : https://myaccount.google.com/apppasswords');
    } else if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(err.code)) {
      console.log('  → Serveur injoignable : vérifiez SMTP_HOST / SMTP_PORT (587 en général, 465 en SSL) et votre connexion.');
    }
    process.exit(1);
  }
})();
