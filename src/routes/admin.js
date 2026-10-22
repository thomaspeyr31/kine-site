// Espace du kiné : /api/admin/…
const express = require('express');
const db = require('../db');
const { HttpError, str, int, wrap, DATE_RE, TIME_RE } = require('../lib/http');
const { requireAdmin } = require('../lib/auth');
const { endTime, overlaps } = require('../lib/slots');
const { invoicePdf } = require('../lib/invoice');
const appts = require('./appointments');

const { TYPES } = appts;

const router = express.Router();
router.use(requireAdmin);

// ---------- Tableau de bord ----------
router.get('/stats', wrap(async (req, res) => {
  const [today, upcoming, revenue, clients] = await Promise.all([
    db.one("SELECT COUNT(*) AS n FROM appointments WHERE status = 'confirme' AND DATE(start_at) = CURDATE()"),
    db.one("SELECT COUNT(*) AS n FROM appointments WHERE status = 'confirme' AND start_at >= NOW()"),
    db.one("SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS n FROM orders WHERE status = 'paid'"),
    db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'client'"),
  ]);
  res.json({
    todayAppointments: today.n, upcomingAppointments: upcoming.n,
    revenueCents: Number(revenue.cents), paidOrders: revenue.n, clients: clients.n,
  });
}));

// ---------- Rendez-vous ----------
router.get('/appointments', wrap(async (req, res) => {
  const scope = req.query.scope === 'past' ? 'past' : 'upcoming';
  const rows = await db.query(
    `SELECT id, type, source, first_name, last_name, email, phone, birth_date, has_prescription, message, start_at, end_at, status, created_at
     FROM appointments WHERE ${scope === 'past' ? 'start_at < NOW() ORDER BY start_at DESC LIMIT 200' : 'start_at >= CURDATE() ORDER BY start_at'}`
  );
  res.json({ appointments: rows.map((a) => ({ ...a, type_label: TYPES[a.type] })) });
}));

const STATUSES = ['confirme', 'annule', 'termine', 'absent'];

// Changement de statut (annulé par le cabinet → e-mail au patient si le RDV était à venir)
router.patch('/appointments/:id', wrap(async (req, res) => {
  if (!STATUSES.includes(req.body.status)) throw new HttpError(400, 'Statut invalide.');
  const a = await db.one('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable.');
  try {
    await db.query('UPDATE appointments SET status = ? WHERE id = ?', [req.body.status, a.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ce créneau a été repris par un autre patient.');
    throw err;
  }
  const future = new Date(a.start_at.replace(' ', 'T')) > new Date();
  if (req.body.status === 'annule' && a.status === 'confirme' && future && req.body.notify !== false) appts.mailCancelledByCabinet(a);
  res.json({ ok: true });
}));

function readSlot(b) {
  const day = String(b.date || '');
  const time = String(b.time || '');
  if (!DATE_RE.test(day) || !TIME_RE.test(time)) throw new HttpError(400, 'Date ou heure invalide.');
  return { day, time };
}

// RDV saisi par le cabinet (téléphone, au comptoir…) : horaires libres, e-mail facultatif
router.post('/appointments', wrap(async (req, res) => {
  const b = req.body;
  const { day, time } = readSlot(b);
  const minutes = b.duration ? int(b.duration, { min: 10, max: 240, label: 'Durée' }) : undefined;
  const start = `${day} ${time}:00`;
  const end = endTime(day, time, minutes);
  if (!end) throw new HttpError(400, 'Le rendez-vous doit se terminer avant minuit.');
  if (await overlaps(start, end)) throw new HttpError(409, 'Un autre rendez-vous occupe déjà ce créneau.');

  const appt = { ...appts.readPerson(b, { emailRequired: false, refDay: day }), source: 'cabinet', start_at: start, end_at: end, cancel_token: appts.newToken() };
  const known = appt.email && await db.one('SELECT id FROM users WHERE email = ?', [appt.email]);
  appt.user_id = known ? known.id : null;
  try {
    await db.query('INSERT INTO appointments SET ?', [appt]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Un autre rendez-vous commence déjà à cette heure.');
    throw err;
  }
  if (appt.email && b.notify !== false) appts.mailConfirmation(appt);
  res.status(201).json({ ok: true });
}));

// Déplacer un RDV (même durée)
router.put('/appointments/:id/move', wrap(async (req, res) => {
  const a = await db.one('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable.');
  if (a.status !== 'confirme') throw new HttpError(400, 'Seul un rendez-vous confirmé peut être déplacé.');
  const { day, time } = readSlot(req.body);
  const minutes = Math.round((new Date(a.end_at.replace(' ', 'T')) - new Date(a.start_at.replace(' ', 'T'))) / 60000);
  const start = `${day} ${time}:00`;
  const end = endTime(day, time, minutes);
  if (!end) throw new HttpError(400, 'Le rendez-vous doit se terminer avant minuit.');
  if (await overlaps(start, end, a.id)) throw new HttpError(409, 'Un autre rendez-vous occupe déjà ce créneau.');
  try {
    await db.query('UPDATE appointments SET start_at = ?, end_at = ?, reminder_sent_at = NULL WHERE id = ?', [start, end, a.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Un autre rendez-vous commence déjà à cette heure.');
    throw err;
  }
  if (a.email && req.body.notify !== false) appts.mailMoved({ ...a, start_at: start });
  res.json({ ok: true });
}));

// ---------- Commandes ----------
router.get('/orders', wrap(async (req, res) => {
  const orders = await db.query(
    `SELECT id, amount_cents, status, created_at, paid_at, invoice_number,
            billing_name, billing_email, program_title AS title, (user_id IS NULL) AS account_deleted
     FROM orders ORDER BY created_at DESC LIMIT 500`
  );
  res.json({ orders });
}));

router.get('/orders/:id/invoice.pdf', wrap(async (req, res) => {
  const order = await db.one('SELECT * FROM orders WHERE id = ? AND invoice_number IS NOT NULL', [req.params.id]);
  if (!order) throw new HttpError(404, 'Facture introuvable.');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="facture-${order.invoice_number}.pdf"` });
  res.send(await invoicePdf(order));
}));

// Export comptable CSV (factures payées / remboursées)
router.get('/orders.csv', wrap(async (req, res) => {
  const rows = await db.query(
    "SELECT invoice_number, paid_at, billing_name, billing_email, program_title, amount_cents, vat_rate_bp, status FROM orders WHERE invoice_number IS NOT NULL ORDER BY invoice_number"
  );
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const money = (c) => (c / 100).toFixed(2).replace('.', ',');
  const lines = [['Facture', 'Date', 'Client', 'E-mail', 'Programme', 'HT', 'TVA', 'TTC', 'Statut'].map(cell).join(';')];
  for (const o of rows) {
    const ht = Math.round(o.amount_cents / (1 + o.vat_rate_bp / 10000));
    lines.push([o.invoice_number, o.paid_at, o.billing_name, o.billing_email, o.program_title,
      money(ht), money(o.amount_cents - ht), money(o.amount_cents), o.status].map(cell).join(';'));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ventes.csv"' });
  res.send('\ufeff' + lines.join('\r\n'));
}));

// ---------- Programmes ----------
router.get('/programs', wrap(async (req, res) => {
  const programs = await db.query(
    `SELECT p.id, p.slug, p.title, p.body_area, p.level, p.price_cents, p.is_published, p.duration_weeks,
       (SELECT COUNT(*) FROM orders o WHERE o.program_id = p.id AND o.status = 'paid') AS sales
     FROM programs p ORDER BY p.id`
  );
  res.json({ programs });
}));

router.get('/programs/:id', wrap(async (req, res) => {
  const program = await db.one('SELECT * FROM programs WHERE id = ?', [req.params.id]);
  if (!program) throw new HttpError(404, 'Programme introuvable.');
  const exercises = await db.query(
    'SELECT id, week_number, name, instructions, sets, reps, rest_seconds, video_url FROM program_exercises WHERE program_id = ? ORDER BY week_number, position, id',
    [program.id]
  );
  res.json({ program, exercises });
}));

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);

function readProgram(b) {
  const title = str(b.title, { max: 150, required: true, label: 'Titre' });
  const level = ['debutant', 'intermediaire', 'avance'].includes(b.level) ? b.level : 'debutant';
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0.5 || price > 10000) throw new HttpError(400, 'Prix invalide (minimum 0,50 €).');
  const exercises = Array.isArray(b.exercises) ? b.exercises : [];
  return {
    data: {
      title,
      slug: slugify(str(b.slug, { max: 120 }) || title),
      body_area: str(b.bodyArea, { max: 60, required: true, label: 'Zone' }),
      level,
      short_description: str(b.shortDescription, { max: 255, required: true, label: 'Résumé' }),
      description: str(b.description, { max: 20000, required: true, label: 'Description' }),
      duration_weeks: int(b.durationWeeks, { min: 1, max: 52, label: 'Durée' }),
      sessions_per_week: int(b.sessionsPerWeek, { min: 1, max: 14, label: 'Séances par semaine' }),
      price_cents: Math.round(price * 100),
      is_published: b.isPublished ? 1 : 0,
    },
    exercises: exercises.map((e, i) => {
      const url = str(e.videoUrl, { max: 255, label: 'Lien vidéo' });
      if (url && !/^https:\/\//.test(url)) throw new HttpError(400, 'Le lien vidéo doit commencer par https://');
      return [
        e.id ? Number(e.id) || null : null,
        int(e.week, { min: 1, max: 52, label: 'Semaine' }), i,
        str(e.name, { max: 150, required: true, label: `Nom de l'exercice ${i + 1}` }),
        str(e.instructions, { max: 2000 }) || null,
        e.sets === '' || e.sets == null ? null : int(e.sets, { min: 0, max: 50, label: 'Séries' }),
        str(e.reps, { max: 30 }) || null,
        e.rest === '' || e.rest == null ? null : int(e.rest, { min: 0, max: 3600, label: 'Repos' }),
        url || null,
      ];
    }),
  };
}

async function saveProgram(id, body) {
  const { data, exercises } = readProgram(body);
  try {
    return await db.transaction(async (conn) => {
      let programId = id;
      let existing = [];
      if (id) {
        const [r] = await conn.query('UPDATE programs SET ? WHERE id = ?', [data, id]);
        if (!r.affectedRows) throw new HttpError(404, 'Programme introuvable.');
        [existing] = await conn.query('SELECT id FROM program_exercises WHERE program_id = ?', [id]);
      } else {
        const [r] = await conn.query('INSERT INTO programs SET ?', [data]);
        programId = r.insertId;
      }
      // Les exercices existants sont mis à jour (et non recréés) pour conserver la progression des patients
      const known = new Set(existing.map((e) => e.id));
      const kept = new Set();
      for (const [exId, ...fields] of exercises) {
        if (exId && known.has(exId) && !kept.has(exId)) {
          await conn.query(
            'UPDATE program_exercises SET week_number = ?, position = ?, name = ?, instructions = ?, sets = ?, reps = ?, rest_seconds = ?, video_url = ? WHERE id = ?',
            [...fields, exId]
          );
          kept.add(exId);
        } else {
          await conn.query(
            'INSERT INTO program_exercises (program_id, week_number, position, name, instructions, sets, reps, rest_seconds, video_url) VALUES (?)',
            [[programId, ...fields]]
          );
        }
      }
      const removed = [...known].filter((x) => !kept.has(x));
      if (removed.length) await conn.query('DELETE FROM program_exercises WHERE id IN (?)', [removed]);
      return programId;
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Un programme utilise déjà cette adresse (slug).');
    throw err;
  }
}

router.post('/programs', wrap(async (req, res) => {
  res.status(201).json({ id: await saveProgram(null, req.body) });
}));

router.put('/programs/:id', wrap(async (req, res) => {
  res.json({ id: await saveProgram(Number(req.params.id), req.body) });
}));

router.delete('/programs/:id', wrap(async (req, res) => {
  const sold = await db.one('SELECT COUNT(*) AS n FROM orders WHERE program_id = ?', [req.params.id]);
  if (sold.n > 0) {
    // Un programme déjà vendu reste accessible aux acheteurs : on le masque seulement du catalogue
    await db.query('UPDATE programs SET is_published = 0 WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, unpublished: true });
  }
  await db.query('DELETE FROM programs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- Horaires & fermetures ----------
router.get('/schedule', wrap(async (req, res) => {
  const [hours, closures] = await Promise.all([
    db.query('SELECT weekday, TIME_FORMAT(start_time, "%H:%i") AS start, TIME_FORMAT(end_time, "%H:%i") AS end FROM opening_hours ORDER BY weekday, start_time'),
    db.query('SELECT id, start_date, end_date, TIME_FORMAT(start_time, "%H:%i") AS start_time, TIME_FORMAT(end_time, "%H:%i") AS end_time, reason FROM closures WHERE end_date >= CURDATE() ORDER BY start_date, start_time'),
  ]);
  res.json({ hours, closures });
}));

router.put('/schedule/hours', wrap(async (req, res) => {
  const hours = Array.isArray(req.body.hours) ? req.body.hours : [];
  const rows = hours.map((h) => {
    const wd = int(h.weekday, { min: 1, max: 7, label: 'Jour' });
    if (!TIME_RE.test(h.start) || !TIME_RE.test(h.end) || h.start >= h.end) throw new HttpError(400, 'Plage horaire invalide.');
    return [wd, h.start, h.end];
  });
  await db.transaction(async (conn) => {
    await conn.query('DELETE FROM opening_hours');
    if (rows.length) await conn.query('INSERT INTO opening_hours (weekday, start_time, end_time) VALUES ?', [rows]);
  });
  res.json({ ok: true });
}));

router.post('/schedule/closures', wrap(async (req, res) => {
  const { start, end } = req.body;
  if (!DATE_RE.test(start || '') || !DATE_RE.test(end || '') || start > end) throw new HttpError(400, 'Dates invalides.');
  // Heures facultatives : sans heures = journée(s) entière(s), sinon seulement cette plage
  const t1 = req.body.startTime || null;
  const t2 = req.body.endTime || null;
  if ((t1 || t2) && (!TIME_RE.test(t1 || '') || !TIME_RE.test(t2 || '') || t1 >= t2)) throw new HttpError(400, 'Plage horaire invalide.');
  await db.query('INSERT INTO closures (start_date, end_date, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?)',
    [start, end, t1, t2, str(req.body.reason, { max: 150 }) || null]);
  res.status(201).json({ ok: true });
}));

router.delete('/schedule/closures/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM closures WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
