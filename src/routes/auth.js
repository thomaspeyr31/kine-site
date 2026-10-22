const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { HttpError, str, email, phone, password, wrap } = require('../lib/http');
const { openSession } = require('../lib/auth');
const { sendMail } = require('../lib/mailer');
const { findOrCreatePatient } = require('../lib/patients');
const { renderEmail } = require('../lib/email-template');

const router = express.Router();

// Limite les tentatives de connexion / inscription (anti brute-force)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans quelques minutes.' } });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Trop de demandes, réessayez dans une heure.' } });

const RESET_MINUTES = 60;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const publicUser = (u) => u && {
  id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, phone: u.phone, role: u.role,
};

router.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/register', limiter, wrap(async (req, res) => {
  const b = req.body;
  const data = {
    first_name: str(b.firstName, { max: 80, required: true, label: 'Prénom' }),
    last_name: str(b.lastName, { max: 80, required: true, label: 'Nom' }),
    email: email(b.email),
    phone: phone(b.phone, false),
  };
  const pwd = password(b.password);
  if (await db.one('SELECT id FROM users WHERE email = ?', [data.email])) {
    throw new HttpError(409, 'Un compte existe déjà avec cette adresse e-mail.');
  }
  const hash = await bcrypt.hash(pwd, 12);
  let r;
  try {
    r = await db.query(
      'INSERT INTO users (first_name, last_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
      [data.first_name, data.last_name, data.email, data.phone, hash]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Un compte existe déjà avec cette adresse e-mail.');
    throw err;
  }
  // Fiche patient (reprend celle d'un RDV déjà pris avec cette adresse) + rattachement des anciens RDV
  await findOrCreatePatient(db, { userId: r.insertId, firstName: data.first_name, lastName: data.last_name, email: data.email, phone: data.phone });
  await db.query('UPDATE appointments SET user_id = ? WHERE user_id IS NULL AND email = ?', [r.insertId, data.email]);
  const welcome = renderEmail({
    title: 'Bienvenue !',
    paragraphs: [`Bonjour ${data.first_name},`, `Votre compte est créé. Vous pouvez y retrouver vos rendez-vous, vos programmes de rééducation et vos factures.`],
    button: { label: 'Mon espace', url: `${config.baseUrl}/compte.html` },
  });
  sendMail({ to: data.email, subject: `Bienvenue — ${config.site.name}`, ...welcome });
  const user = await db.one('SELECT * FROM users WHERE id = ?', [r.insertId]);
  await openSession(req, user);
  res.status(201).json({ user: publicUser(user) });
}));

router.post('/login', limiter, wrap(async (req, res) => {
  const mail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = mail ? await db.one('SELECT * FROM users WHERE email = ?', [mail]) : null;
  const ok = user && typeof req.body.password === 'string' && (await bcrypt.compare(req.body.password, user.password_hash));
  if (!ok) throw new HttpError(401, 'E-mail ou mot de passe incorrect.');
  await openSession(req, user);
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('kine.sid');
    res.json({ ok: true });
  });
});

// ---------- Mot de passe oublié ----------
// Réponse identique que le compte existe ou non (ne révèle pas quelles adresses sont inscrites)
router.post('/forgot', resetLimiter, wrap(async (req, res) => {
  const mail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = mail ? await db.one('SELECT id, first_name, email FROM users WHERE email = ?', [mail]) : null;
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
    await db.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
      [user.id, sha256(token), RESET_MINUTES]
    );
    const { html, text } = renderEmail({
      title: 'Réinitialisation du mot de passe',
      paragraphs: [`Bonjour ${user.first_name},`, `Pour choisir un nouveau mot de passe, cliquez sur le bouton ci-dessous. Le lien est valable ${RESET_MINUTES} minutes et ne peut servir qu'une fois.`],
      button: { label: 'Choisir un nouveau mot de passe', url: `${config.baseUrl}/reinitialiser.html?token=${token}` },
      after: ['Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement cet e-mail : votre mot de passe actuel reste valable.'],
    });
    sendMail({ to: user.email, subject: 'Réinitialisation de votre mot de passe', text, html });
  }
  res.json({ ok: true });
}));

router.post('/reset', limiter, wrap(async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const pwd = password(req.body.password);
  const reset = token && await db.one(
    'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
    [sha256(token)]
  );
  if (!reset) throw new HttpError(400, 'Lien invalide ou expiré. Refaites une demande de réinitialisation.');
  const hash = await bcrypt.hash(pwd, 12);
  await db.transaction(async (conn) => {
    await conn.query('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [hash, reset.user_id]);
    await conn.query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [reset.id]);
  });
  const user = await db.one('SELECT * FROM users WHERE id = ?', [reset.user_id]);
  await openSession(req, user); // connecté directement ; les autres appareils sont déconnectés
  res.json({ user: publicUser(user) });
}));

module.exports = router;
