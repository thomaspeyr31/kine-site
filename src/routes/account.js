// Espace patient connecté : /api/me/…
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { HttpError, str, phone, password, int, wrap } = require('../lib/http');
const { requireAuth, openSession } = require('../lib/auth');
const { invoicePdf } = require('../lib/invoice');
const { TYPES, cancelAppointment } = require('./appointments');
const { ownsProgram } = require('./programs');

const router = express.Router();
router.use(requireAuth);

const sensitiveLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans quelques minutes.' } });

async function checkPassword(user, pwd) {
  const row = await db.one('SELECT password_hash FROM users WHERE id = ?', [user.id]);
  if (typeof pwd !== 'string' || !(await bcrypt.compare(pwd, row.password_hash))) {
    throw new HttpError(403, 'Mot de passe actuel incorrect.');
  }
}

// ---------- Programmes & progression ----------
router.get('/programs', wrap(async (req, res) => {
  const programs = await db.query(
    `SELECT p.id, p.slug, p.title, p.body_area, p.duration_weeks, o.paid_at,
       (SELECT COUNT(*) FROM program_exercises e WHERE e.program_id = p.id) AS total,
       (SELECT COUNT(*) FROM program_progress pp JOIN program_exercises e ON e.id = pp.exercise_id
          WHERE e.program_id = p.id AND pp.user_id = o.user_id) AS done
     FROM orders o JOIN programs p ON p.id = o.program_id
     WHERE o.user_id = ? AND o.status = 'paid' ORDER BY o.paid_at DESC`,
    [req.user.id]
  );
  res.json({ programs });
}));

// Coche / décoche un exercice
router.put('/progress/:exerciseId', wrap(async (req, res) => {
  const exerciseId = int(req.params.exerciseId, { min: 1, label: 'Exercice' });
  const ex = await db.one('SELECT program_id FROM program_exercises WHERE id = ?', [exerciseId]);
  if (!ex || !(await ownsProgram(req.user, ex.program_id))) throw new HttpError(404, 'Exercice introuvable.');
  if (req.body.done) {
    await db.query('INSERT IGNORE INTO program_progress (user_id, exercise_id) VALUES (?, ?)', [req.user.id, exerciseId]);
  } else {
    await db.query('DELETE FROM program_progress WHERE user_id = ? AND exercise_id = ?', [req.user.id, exerciseId]);
  }
  res.json({ ok: true });
}));

// Journal de séance : douleur (0-10), ressenti, commentaire — visible par le kiné dans la fiche patient
const DIFFICULTY = ['facile', 'adaptee', 'difficile'];
router.post('/sessions', wrap(async (req, res) => {
  const b = req.body;
  const programId = int(b.programId, { min: 1, label: 'Programme' });
  if (!(await ownsProgram(req.user, programId))) throw new HttpError(404, 'Programme introuvable.');
  const log = {
    user_id: req.user.id,
    program_id: programId,
    week_number: int(b.week, { min: 1, max: 52, label: 'Semaine' }),
    pain: int(b.pain, { min: 0, max: 10, label: 'Douleur' }),
    difficulty: DIFFICULTY.includes(b.difficulty) ? b.difficulty : 'adaptee',
    comment: str(b.comment, { max: 1000, label: 'Commentaire' }) || null,
  };
  // Une seule séance enregistrée par jour et par programme (évite les doubles clics)
  const today = await db.one('SELECT id FROM session_logs WHERE user_id = ? AND program_id = ? AND DATE(created_at) = CURDATE()', [req.user.id, programId]);
  if (today) await db.query('UPDATE session_logs SET ? WHERE id = ?', [log, today.id]);
  else await db.query('INSERT INTO session_logs SET ?', [log]);
  res.status(201).json({ ok: true, updated: !!today });
}));

// ---------- Commandes & factures ----------
router.get('/orders', wrap(async (req, res) => {
  const orders = await db.query(
    `SELECT id, program_title, amount_cents, status, paid_at, invoice_number
     FROM orders WHERE user_id = ? AND invoice_number IS NOT NULL ORDER BY paid_at DESC`,
    [req.user.id]
  );
  res.json({ orders });
}));

router.get('/orders/:id/invoice.pdf', wrap(async (req, res) => {
  const order = await db.one('SELECT * FROM orders WHERE id = ? AND user_id = ? AND invoice_number IS NOT NULL', [req.params.id, req.user.id]);
  if (!order) throw new HttpError(404, 'Facture introuvable.');
  const pdf = await invoicePdf(order);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="facture-${order.invoice_number}.pdf"` });
  res.send(pdf);
}));

// ---------- Rendez-vous ----------
router.get('/appointments', wrap(async (req, res) => {
  const rows = await db.query(
    'SELECT id, type, start_at, end_at, status, cancel_token FROM appointments WHERE user_id = ? ORDER BY start_at DESC',
    [req.user.id]
  );
  res.json({ appointments: rows.map((a) => ({ ...a, type_label: TYPES[a.type] })) });
}));

router.post('/appointments/:id/cancel', wrap(async (req, res) => {
  const a = await db.one('SELECT id, start_at, status FROM appointments WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable.');
  await cancelAppointment(a);
  res.json({ ok: true });
}));

// ---------- Profil ----------
router.put('/profile', wrap(async (req, res) => {
  const b = req.body;
  await db.query('UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?', [
    str(b.firstName, { max: 80, required: true, label: 'Prénom' }),
    str(b.lastName, { max: 80, required: true, label: 'Nom' }),
    phone(b.phone, false),
    req.user.id,
  ]);
  res.json({ ok: true });
}));

router.put('/password', sensitiveLimiter, wrap(async (req, res) => {
  await checkPassword(req.user, req.body.currentPassword);
  const hash = await bcrypt.hash(password(req.body.newPassword), 12);
  await db.query('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [hash, req.user.id]);
  // Les autres appareils sont déconnectés, celui-ci reste connecté
  await openSession(req, await db.one('SELECT id, session_version FROM users WHERE id = ?', [req.user.id]));
  res.json({ ok: true });
}));

// ---------- RGPD : export et suppression ----------
router.get('/export', wrap(async (req, res) => {
  const [profile, appointments, orders, progress] = await Promise.all([
    db.one('SELECT first_name, last_name, email, phone, created_at FROM users WHERE id = ?', [req.user.id]),
    db.query('SELECT type, start_at, end_at, status, first_name, last_name, email, phone, birth_date, has_prescription, message, created_at FROM appointments WHERE user_id = ?', [req.user.id]),
    db.query('SELECT program_title, amount_cents, status, created_at, paid_at, invoice_number FROM orders WHERE user_id = ?', [req.user.id]),
    db.query(`SELECT p.title AS programme, e.week_number AS semaine, e.name AS exercice, pp.done_at
              FROM program_progress pp JOIN program_exercises e ON e.id = pp.exercise_id JOIN programs p ON p.id = e.program_id
              WHERE pp.user_id = ?`, [req.user.id]),
  ]);
  const sessions = await db.query(
    `SELECT p.title AS programme, s.week_number AS semaine, s.pain AS douleur, s.difficulty AS ressenti, s.comment AS commentaire, s.created_at
     FROM session_logs s JOIN programs p ON p.id = s.program_id WHERE s.user_id = ? ORDER BY s.created_at`, [req.user.id]);
  res.set('Content-Disposition', 'attachment; filename="mes-donnees.json"');
  res.json({ exportedAt: new Date().toISOString(), profile, appointments, orders, progress, sessions });
}));

router.post('/delete', sensitiveLimiter, wrap(async (req, res, next) => {
  await checkPassword(req.user, req.body.password);
  await db.transaction(async (conn) => {
    // Les RDV à venir sont annulés (le créneau se libère) ; l'historique est détaché du compte
    await conn.query("UPDATE appointments SET status = 'annule' WHERE user_id = ? AND status = 'confirme' AND start_at > NOW()", [req.user.id]);
    // Les factures restent (obligation comptable 10 ans) : orders.user_id passe à NULL automatiquement
    await conn.query('DELETE FROM users WHERE id = ?', [req.user.id]);
  });
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('kine.sid');
    res.json({ ok: true });
  });
}));

module.exports = router;
