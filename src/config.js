require('dotenv').config({ quiet: true });
process.env.TZ = process.env.TZ || 'Europe/Paris';

const isProd = process.env.NODE_ENV === 'production';
const num = (v, def) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? def : Number(v));

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET doit faire au moins 32 caractères en production.');
}

const config = {
  isProd,
  port: num(process.env.PORT, 3000),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-a-changer-dev-secret-a-changer',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kine_db',
  },

  booking: {
    slotMinutes: num(process.env.SLOT_MINUTES, 45), // durée d'un RDV
    minNoticeHours: num(process.env.MIN_NOTICE_HOURS, 2), // délai minimum avant un RDV
    maxDaysAhead: num(process.env.MAX_DAYS_AHEAD, 60), // réservation possible jusqu'à J+60
    cancelHours: num(process.env.CANCEL_HOURS, 24), // annulation en ligne jusqu'à H-24
    reminders: process.env.REMINDERS !== 'off', // e-mail de rappel la veille
  },

  // Durées de conservation (RGPD) — purge automatique quotidienne
  retention: {
    appointmentsMonths: num(process.env.RETENTION_APPOINTMENTS_MONTHS, 36),
  },

  site: {
    name: process.env.SITE_NAME || 'Cabinet Élan',
    therapist: process.env.THERAPIST_NAME || 'Camille Martin',
    phone: process.env.SITE_PHONE || '05 00 00 00 00',
    email: process.env.SITE_EMAIL || 'contact@exemple.fr',
    address: process.env.SITE_ADDRESS || '12 rue du Mouvement, 33000 Ville',
  },

  // Mentions obligatoires (factures, mentions légales)
  legal: {
    siret: process.env.SIRET || '',
    rpps: process.env.RPPS || '',
    host: process.env.HOST_INFO || '',
    // Taux de TVA en % sur les programmes (0 = franchise en base)
    vatRate: num(process.env.VAT_RATE, 0),
    vatNumber: process.env.VAT_NUMBER || '',
    vatExemptMention: process.env.VAT_EXEMPT_MENTION || 'TVA non applicable, art. 293 B du CGI',
    invoicePrefix: process.env.INVOICE_PREFIX || 'F',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Cabinet <no-reply@exemple.fr>',
  },
};

// Sans clé Stripe, en développement uniquement : les achats sont validés sans paiement.
config.demoPayments = !config.stripe.secretKey && !isProd;

// Points de configuration à vérifier avant d'ouvrir le site au public
config.productionWarnings = () => {
  const w = [];
  if (!config.baseUrl.startsWith('https://')) w.push('BASE_URL doit être en https:// (ex. https://www.mon-cabinet.fr).');
  if (!config.stripe.secretKey) w.push('STRIPE_SECRET_KEY absent : les achats sont impossibles.');
  else if (config.stripe.secretKey.startsWith('sk_test_')) w.push('Clé Stripe de TEST : aucun vrai paiement ne sera encaissé.');
  if (config.stripe.secretKey && !config.stripe.webhookSecret) w.push('STRIPE_WEBHOOK_SECRET absent : configurez le webhook Stripe.');
  if (!config.smtp.host) w.push('SMTP non configuré : aucun e-mail (confirmations, rappels, mot de passe oublié) ne part.');
  if (!config.legal.siret) w.push('SIRET absent : obligatoire sur les factures et les mentions légales.');
  return w;
};

module.exports = config;
