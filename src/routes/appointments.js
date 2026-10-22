const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { HttpError, str, email, phone, wrap, DATE_RE, TIME_RE } = require('../lib/http');
const { slotsForDate, monthAvailability, endTime } = require('../lib/slots');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

const TYPES = {
  bilan: 'Bilan initial',
  seance: 'Séance de rééducation',
  suivi: 'Suivi de programme en ligne',
};

// "2026-11-03 08:30:00" → "mardi 3 novembre 2026 à 08h30"
const frWhen = (startAt) => {
  const [day, time] = String(startAt).split(' ');
  return new Date(`${day}T${time}`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ` à ${time.slice(0, 5).replace(':', 'h')}`;
};

const newToken = () => crypto.randomBytes(24).toString('hex');
const cancelLink = (token) => `${config.baseUrl}/annulation.html?token=${token}`;
const practical = 'Pensez à apporter votre ordonnance, votre carte Vitale et une tenue confortable.';

// ---------- E-mails au patient ----------
function mailConfirmation(a) {
  return sendMail({
    to: a.email,
    subject: `Rendez-vous confirmé — ${frWhen(a.start_at)}`,
    text: `Bonjour ${a.first_name},\n\nVotre rendez-vous (${TYPES[a.type]}) est confirmé le ${frWhen(a.start_at)}.\nAdresse : ${config.site.address}\n\n${practical}\n\nBesoin d'annuler ? ${cancelLink(a.cancel_token)}\n(annulation en ligne possible jusqu'à ${config.booking.cancelHours} h avant, sinon par téléphone au ${config.site.phone})`,
  });
}

function mailMoved(a) {
  return sendMail({
    to: a.email,
    subject: `Rendez-vous déplacé — ${frWhen(a.start_at)}`,
    text: `Bonjour ${a.first_name},\n\nVotre rendez-vous (${TYPES[a.type]}) a été déplacé au ${frWhen(a.start_at)}.\nAdresse : ${config.site.address}\n\nCe nouvel horaire ne vous convient pas ? Appelez le cabinet au ${config.site.phone} ou annulez ici : ${cancelLink(a.cancel_token)}`,
  });
}

function mailCancelledByCabinet(a) {
  return sendMail({
    to: a.email,
    subject: `Rendez-vous annulé — ${frWhen(a.start_at)}`,
    text: `Bonjour ${a.first_name},\n\nNous sommes désolés : votre rendez-vous du ${frWhen(a.start_at)} a dû être annulé par le cabinet.\nVous pouvez réserver un autre créneau ici : ${config.baseUrl}/rdv.html ou nous appeler au ${config.site.phone}.`,
  });
}

function mailReminder(a) {
  return sendMail({
    to: a.email,
    subject: `Rappel : rendez-vous ${frWhen(a.start_at)}`,
    text: `Bonjour ${a.first_name},\n\nPetit rappel : vous avez rendez-vous (${TYPES[a.type]}) le ${frWhen(a.start_at)}.\nAdresse : ${config.site.address}\n\n${practical}\n\nEmpêché ? Prévenez-nous au ${config.site.phone} ou via ce lien : ${cancelLink(a.cancel_token)}`,
  });
}

// ---------- Créneaux ----------
const bookLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Trop de réservations, réessayez plus tard.' } });

// Nombre de créneaux libres par jour d'un mois : ?month=2026-11
router.get('/availability', wrap(async (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Mois invalide (format AAAA-MM).');
  res.json({ days: await monthAvailability(month), slotMinutes: config.booking.slotMinutes });
}));

// Créneaux libres d'une journée : ?date=2026-11-03
router.get('/slots', wrap(async (req, res) => {
  const day = String(req.query.date || '');
  if (!DATE_RE.test(day)) throw new HttpError(400, 'Date invalide.');
  res.json({ date: day, slots: await slotsForDate(day) });
}));

router.get('/types', (req, res) => res.json({ types: TYPES }));

// Horaires d'ouverture publics (page "Le cabinet")
router.get('/hours', wrap(async (req, res) => {
  const hours = await db.query(
    'SELECT weekday, TIME_FORMAT(start_time, "%H:%i") AS start, TIME_FORMAT(end_time, "%H:%i") AS end FROM opening_hours ORDER BY weekday, start_time'
  );
  res.json({ hours });
}));

// Lit et valide les informations du patient (email facultatif pour une saisie par le cabinet)
function readPerson(b, { emailRequired = true, refDay } = {}) {
  const birth = b.birthDate ? String(b.birthDate) : null;
  if (birth && (!DATE_RE.test(birth) || (refDay && birth > refDay) || birth < '1900-01-01')) throw new HttpError(400, 'Date de naissance invalide.');
  if (!TYPES[b.type]) throw new HttpError(400, 'Type de rendez-vous invalide.');
  return {
    type: b.type,
    first_name: str(b.firstName, { max: 80, required: true, label: 'Prénom' }),
    last_name: str(b.lastName, { max: 80, required: true, label: 'Nom' }),
    email: emailRequired || (typeof b.email === 'string' && b.email.trim()) ? email(b.email) : null,
    phone: phone(b.phone, true),
    birth_date: birth,
    has_prescription: b.hasPrescription ? 1 : 0,
    message: str(b.message, { max: 2000, label: 'Message' }) || null,
  };
}

// Réserver en ligne (avec ou sans compte)
router.post('/', bookLimiter, wrap(async (req, res) => {
  const b = req.body;
  const day = String(b.date || '');
  const time = String(b.time || '');
  if (!DATE_RE.test(day) || !TIME_RE.test(time)) throw new HttpError(400, 'Créneau invalide.');
  if (b.consent !== true) throw new HttpError(400, 'Merci d\'accepter l\'utilisation de vos données pour la prise de rendez-vous.');
  const person = readPerson(b, { refDay: day });

  // Le créneau doit faire partie des créneaux réellement libres
  const free = await slotsForDate(day);
  if (!free.includes(time)) throw new HttpError(409, 'Ce créneau n\'est plus disponible, merci d\'en choisir un autre.');

  const appt = {
    ...person,
    user_id: req.user ? req.user.id : null,
    source: 'web',
    start_at: `${day} ${time}:00`,
    end_at: endTime(day, time),
    cancel_token: newToken(),
  };
  try {
    await db.query('INSERT INTO appointments SET ?', [appt]);
  } catch (err) {
    // Contrainte unique : quelqu'un a réservé le même créneau au même instant
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ce créneau vient d\'être réservé, merci d\'en choisir un autre.');
    throw err;
  }

  mailConfirmation(appt);
  sendMail({
    to: config.site.email,
    subject: `Nouveau RDV : ${appt.first_name} ${appt.last_name} — ${frWhen(appt.start_at)}`,
    text: `${TYPES[appt.type]}\n${appt.first_name} ${appt.last_name}\n${appt.email} — ${appt.phone}\nNaissance : ${appt.birth_date || '—'}\nOrdonnance : ${appt.has_prescription ? 'oui' : 'non'}\nMotif : ${appt.message || '—'}\n\n${config.baseUrl}/admin.html`,
  });

  res.status(201).json({ ok: true, when: frWhen(appt.start_at) });
}));

// Consulter / annuler un RDV via le lien reçu par e-mail
router.get('/by-token/:token', wrap(async (req, res) => {
  const a = await db.one('SELECT type, first_name, start_at, status FROM appointments WHERE cancel_token = ?', [req.params.token]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable.');
  res.json({ appointment: { ...a, type_label: TYPES[a.type] } });
}));

router.post('/by-token/:token/cancel', wrap(async (req, res) => {
  const a = await db.one('SELECT * FROM appointments WHERE cancel_token = ?', [req.params.token]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable.');
  await cancelAppointment(a);
  res.json({ ok: true });
}));

// Annulation par le patient (lien e-mail ou espace patient)
async function cancelAppointment(a) {
  if (a.status !== 'confirme') throw new HttpError(400, 'Ce rendez-vous ne peut plus être annulé.');
  const start = new Date(a.start_at.replace(' ', 'T'));
  if (start.getTime() - Date.now() < config.booking.cancelHours * 3600e3) {
    throw new HttpError(400, `Annulation en ligne impossible à moins de ${config.booking.cancelHours} h. Appelez le cabinet au ${config.site.phone}.`);
  }
  await db.query("UPDATE appointments SET status = 'annule' WHERE id = ?", [a.id]);
  const full = await db.one('SELECT * FROM appointments WHERE id = ?', [a.id]);
  sendMail({
    to: config.site.email,
    subject: `RDV annulé par le patient : ${full.first_name} ${full.last_name} — ${frWhen(full.start_at)}`,
    text: `Le créneau du ${frWhen(full.start_at)} est de nouveau disponible en ligne.`,
  });
}

// ---------- Rappels (appelé par la tâche planifiée) ----------
// Rappel par e-mail pour les RDV des prochaines 24 h, s'ils ont été pris plus de 24 h à l'avance… ou
// au moins 2 h avant d'être envoyés (pas de rappel pour un RDV réservé à l'instant).
async function sendReminders() {
  if (!config.booking.reminders) return 0;
  const due = await db.query(
    `SELECT * FROM appointments
     WHERE status = 'confirme' AND reminder_sent_at IS NULL AND email IS NOT NULL
       AND start_at > NOW() AND start_at <= NOW() + INTERVAL 24 HOUR
       AND created_at <= NOW() - INTERVAL 2 HOUR`
  );
  let sent = 0;
  for (const a of due) {
    // Marquage atomique : un seul envoi même si plusieurs instances tournent
    const r = await db.query('UPDATE appointments SET reminder_sent_at = NOW() WHERE id = ? AND reminder_sent_at IS NULL', [a.id]);
    if (r.affectedRows && (await mailReminder(a))) sent++;
  }
  return sent;
}

module.exports = router;
Object.assign(module.exports, {
  TYPES, frWhen, newToken, readPerson, cancelAppointment, sendReminders,
  mailConfirmation, mailMoved, mailCancelledByCabinet,
});
