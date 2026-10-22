const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { HttpError, str, email, phone, wrap, DATE_RE, TIME_RE } = require('../lib/http');
const { slotsForDate, monthAvailability, endTime } = require('../lib/slots');
const { sendMail } = require('../lib/mailer');
const { renderEmail } = require('../lib/email-template');
const { appointmentIcs } = require('../lib/ics');
const { findOrCreatePatient } = require('../lib/patients');

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
const minutesBetween = (a, b) => Math.round((new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'))) / 60000);

const newToken = () => crypto.randomBytes(24).toString('hex');
const cancelLink = (token) => `${config.baseUrl}/annulation.html?token=${token}`;
const mapsLink = () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.site.address)}`;
const PRACTICAL = 'À apporter : ordonnance, carte Vitale, comptes rendus d\'imagerie éventuels et une tenue confortable (short, baskets).';

// ---------- E-mails au patient (HTML + invitation calendrier) ----------
function icsAttachment(a, cancelled = false) {
  return {
    filename: cancelled ? 'annulation.ics' : 'rendez-vous.ics',
    contentType: `text/calendar; charset=utf-8; method=${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    content: appointmentIcs(a, `${TYPES[a.type]} — ${config.site.name}`, { cancelled, description: PRACTICAL }),
  };
}

const apptDetails = (a) => [
  ['Quand', frWhen(a.start_at)],
  ['Durée', `${minutesBetween(a.start_at, a.end_at)} min`],
  ['Type', TYPES[a.type]],
  ['Avec', config.site.therapist],
  ['Où', config.site.address],
];

function mailConfirmation(a) {
  const { html, text } = renderEmail({
    title: 'Votre rendez-vous est confirmé',
    paragraphs: [`Bonjour ${a.first_name},`, 'Merci pour votre réservation. Voici le récapitulatif :'],
    details: apptDetails(a),
    note: PRACTICAL,
    button: { label: 'Itinéraire', url: mapsLink() },
    after: [
      'L\'invitation jointe (rendez-vous.ics) ajoute le rendez-vous à votre agenda en un clic.',
      `Un empêchement ? Annulez en ligne jusqu'à ${config.booking.cancelHours} h avant ; au-delà, merci de prévenir par téléphone au ${config.site.phone}.`,
    ],
    links: [{ label: 'Annuler ce rendez-vous', url: cancelLink(a.cancel_token) }],
  });
  return sendMail({ to: a.email, subject: `Rendez-vous confirmé — ${frWhen(a.start_at)}`, text, html, attachments: [icsAttachment(a)] });
}

function mailMoved(a) {
  const { html, text } = renderEmail({
    title: 'Votre rendez-vous a été déplacé',
    paragraphs: [`Bonjour ${a.first_name},`, 'Le cabinet a modifié l\'horaire de votre rendez-vous. Nouvel horaire :'],
    details: apptDetails(a),
    after: [
      'Pensez à mettre votre agenda à jour avec l\'invitation jointe.',
      `Ce créneau ne vous convient pas ? Appelez le cabinet au ${config.site.phone}.`,
    ],
    links: [{ label: 'Annuler ce rendez-vous', url: cancelLink(a.cancel_token) }],
  });
  return sendMail({ to: a.email, subject: `Rendez-vous déplacé — ${frWhen(a.start_at)}`, text, html, attachments: [icsAttachment(a)] });
}

function mailCancelledByCabinet(a) {
  const { html, text } = renderEmail({
    title: 'Votre rendez-vous est annulé',
    paragraphs: [`Bonjour ${a.first_name},`, `Nous sommes désolés : votre rendez-vous du ${frWhen(a.start_at)} a dû être annulé par le cabinet.`],
    button: { label: 'Choisir un autre créneau', url: `${config.baseUrl}/rdv.html` },
    after: [`Vous pouvez aussi nous appeler au ${config.site.phone}.`],
  });
  return sendMail({ to: a.email, subject: `Rendez-vous annulé — ${frWhen(a.start_at)}`, text, html, attachments: [icsAttachment(a, true)] });
}

function mailCancelledByPatient(a) {
  const { html, text } = renderEmail({
    title: 'Annulation confirmée',
    paragraphs: [`Bonjour ${a.first_name},`, `Votre rendez-vous du ${frWhen(a.start_at)} est bien annulé.`],
    button: { label: 'Reprendre rendez-vous', url: `${config.baseUrl}/rdv.html` },
  });
  return sendMail({ to: a.email, subject: `Annulation confirmée — ${frWhen(a.start_at)}`, text, html, attachments: [icsAttachment(a, true)] });
}

function mailReminder(a) {
  const { html, text } = renderEmail({
    title: 'Rappel : votre rendez-vous approche',
    paragraphs: [`Bonjour ${a.first_name},`, 'Petit rappel pour votre prochain rendez-vous :'],
    details: apptDetails(a),
    note: PRACTICAL,
    button: { label: 'Itinéraire', url: mapsLink() },
    after: [`Empêché ? Prévenez-nous au ${config.site.phone}.`],
    links: [{ label: 'Annuler ce rendez-vous', url: cancelLink(a.cancel_token) }],
  });
  return sendMail({ to: a.email, subject: `Rappel : rendez-vous ${frWhen(a.start_at)}`, text, html });
}

// ---------- E-mails au cabinet ----------
function mailCabinetNew(a, patientId) {
  const age = a.birth_date ? Math.floor((Date.now() - new Date(a.birth_date)) / (365.25 * 86400e3)) : null;
  const { html, text } = renderEmail({
    title: `Nouveau rendez-vous : ${a.first_name} ${a.last_name}`,
    details: [
      ['Quand', frWhen(a.start_at)],
      ['Type', TYPES[a.type]],
      ['Patient', `${a.first_name} ${a.last_name}${age !== null ? ` (${age} ans)` : ''}`],
      ['Téléphone', a.phone],
      ['E-mail', a.email],
      ['Ordonnance', a.has_prescription ? 'Oui' : 'Non'],
      ['Motif', a.message || '—'],
    ],
    button: { label: 'Ouvrir la fiche patient', url: `${config.baseUrl}/admin.html?patient=${patientId}` },
  });
  return sendMail({ to: config.site.email, subject: `Nouveau RDV : ${a.first_name} ${a.last_name} — ${frWhen(a.start_at)}`, text, html });
}

function mailCabinetCancelled(a) {
  const { html, text } = renderEmail({
    title: `Annulation : ${a.first_name} ${a.last_name}`,
    paragraphs: [`Le patient a annulé son rendez-vous du ${frWhen(a.start_at)}. Le créneau est de nouveau réservable en ligne.`],
    button: { label: 'Voir l\'agenda', url: `${config.baseUrl}/admin.html` },
  });
  return sendMail({ to: config.site.email, subject: `RDV annulé par le patient : ${a.first_name} ${a.last_name} — ${frWhen(a.start_at)}`, text, html });
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

// Lit et valide les informations du patient (e-mail facultatif pour une saisie par le cabinet)
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

// Enregistre un RDV et le rattache à la fiche patient (créée si besoin)
async function insertAppointment(appt, userId) {
  return db.transaction(async (conn) => {
    const patientId = appt.patient_id || await findOrCreatePatient(conn, {
      userId, firstName: appt.first_name, lastName: appt.last_name, email: appt.email, phone: appt.phone, birthDate: appt.birth_date,
    });
    const [r] = await conn.query('INSERT INTO appointments SET ?', [{ ...appt, patient_id: patientId, user_id: userId || null }]);
    return { id: r.insertId, patientId };
  });
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
    source: 'web',
    start_at: `${day} ${time}:00`,
    end_at: endTime(day, time),
    cancel_token: newToken(),
  };
  let saved;
  try {
    saved = await insertAppointment(appt, req.user ? req.user.id : null);
  } catch (err) {
    // Contrainte unique : quelqu'un a réservé le même créneau au même instant
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ce créneau vient d\'être réservé, merci d\'en choisir un autre.');
    throw err;
  }
  const full = { ...appt, id: saved.id };
  const emailSent = await mailConfirmation(full);
  mailCabinetNew(full, saved.patientId);

  res.status(201).json({ ok: true, when: frWhen(appt.start_at), token: appt.cancel_token, emailSent: emailSent === true });
}));

// Consulter / annuler un RDV via le lien reçu par e-mail
router.get('/by-token/:token', wrap(async (req, res) => {
  const a = await db.one('SELECT type, first_name, start_at, end_at, status FROM appointments WHERE cancel_token = ?', [req.params.token]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable.');
  res.json({ appointment: { ...a, type_label: TYPES[a.type] }, cancelHours: config.booking.cancelHours, phone: config.site.phone });
}));

// Fichier .ics "Ajouter à mon agenda"
router.get('/by-token/:token/rendez-vous.ics', wrap(async (req, res) => {
  const a = await db.one('SELECT * FROM appointments WHERE cancel_token = ?', [req.params.token]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable.');
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="rendez-vous.ics"' });
  res.send(appointmentIcs(a, `${TYPES[a.type]} — ${config.site.name}`, { cancelled: a.status === 'annule', description: PRACTICAL }));
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
  mailCancelledByPatient(full);
  mailCabinetCancelled(full);
}

// ---------- Rappels (appelé par la tâche planifiée) ----------
// Rappel par e-mail pour les RDV des prochaines 24 h (pas pour un RDV réservé il y a moins de 2 h).
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
  TYPES, frWhen, newToken, readPerson, insertAppointment, cancelAppointment, sendReminders,
  mailConfirmation, mailMoved, mailCancelledByCabinet,
});
