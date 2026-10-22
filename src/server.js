const config = require('./config');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db = require('./db');
const jobs = require('./jobs');
const { loadUser } = require('./lib/auth');
const { HttpError } = require('./lib/http');
const orders = require('./routes/orders');

const app = express();
app.set('trust proxy', 1); // derrière un reverse proxy (Caddy, Nginx, Render…)
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  hsts: config.isProd ? { maxAge: 31536000 } : false,
}));

// Webhook Stripe : corps brut obligatoire, donc AVANT express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), orders.webhook);

app.use(express.json({ limit: '200kb' }));

// Supervision (Docker, UptimeRobot…) : vérifie aussi la base
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'database' });
  }
});

const sessionStore = new MySQLStore({ createDatabaseTable: true, endConnectionOnClose: false, expiration: 7 * 86400e3 }, db.pool);
app.use(session({
  name: 'kine.sid',
  secret: config.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 7 * 86400e3 },
}));

// Protection CSRF simple : toute requête qui modifie des données doit être en JSON
// (un formulaire d'un autre site ne peut pas envoyer de JSON sans autorisation CORS).
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.is('application/json')) return res.status(415).json({ error: 'Requête JSON attendue.' });
  next();
});

app.use(loadUser);

// Les réponses de l'API ne doivent pas être mises en cache (données personnelles)
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---------- API ----------
app.get('/api/site', (req, res) => res.json({
  ...config.site,
  siret: config.legal.siret,
  rpps: config.legal.rpps,
  hostInfo: config.legal.host,
  vatRate: config.legal.vatRate,
  vatExemptMention: config.legal.vatExemptMention,
  slotMinutes: config.booking.slotMinutes,
  cancelHours: config.booking.cancelHours,
  retentionMonths: config.retention.appointmentsMonths,
  demoPayments: config.demoPayments,
  mailConfigured: !!config.smtp.host,
}));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/orders', orders);
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/me', require('./routes/account'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

// ---------- Référencement ----------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin.html\nDisallow: /compte.html\nDisallow: /mon-programme.html\nDisallow: /api/\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const programs = await db.query('SELECT slug, DATE_FORMAT(updated_at, "%Y-%m-%d") AS updated FROM programs WHERE is_published = 1');
    const urls = ['/', '/programmes.html', '/rdv.html', '/cabinet.html']
      .map((p) => `<url><loc>${config.baseUrl}${p}</loc></url>`)
      .concat(programs.map((p) => `<url><loc>${config.baseUrl}/programme.html?slug=${encodeURIComponent(p.slug)}</loc><lastmod>${p.updated}</lastmod></url>`));
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  } catch (err) {
    next(err);
  }
});

// ---------- Front (fichiers statiques) ----------
const publicDir = path.join(__dirname, '..', 'public');
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
app.use('/fonts', express.static(path.join(publicDir, 'fonts'), { maxAge: '365d', immutable: true }));
app.use(express.static(publicDir, { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));

// ---------- Erreurs ----------
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide.' });
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erreur serveur, réessayez plus tard.' });
});

// ---------- Démarrage ----------
const server = app.listen(config.port, () => {
  console.log(`✔ ${config.site.name} en ligne sur ${config.baseUrl} (port ${config.port}, ${config.isProd ? 'production' : 'développement'})`);
  if (config.demoPayments) console.log('ℹ Mode démo : pas de clé Stripe, les achats sont validés sans paiement.');
  if (!config.isProd && !config.smtp.host) console.log('ℹ SMTP non configuré : les e-mails ne sont pas envoyés, ils s\'affichent ci-dessous dans ce terminal.\n  Pour les recevoir vraiment : remplissez SMTP_* dans .env puis testez avec  npm run test-mail -- votre@adresse.fr');
  if (config.isProd) config.productionWarnings().forEach((w) => console.warn(`⚠ ${w}`));
  jobs.start();
});

// Arrêt propre (redémarrage Docker / pm2) : termine les requêtes en cours puis ferme la base
function shutdown(signal) {
  console.log(`${signal} reçu, arrêt…`);
  server.close(async () => {
    try { sessionStore.close(); await db.pool.end(); } catch { /* déjà fermé */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
