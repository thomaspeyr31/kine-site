// Calcul des créneaux disponibles à partir des horaires, fermetures et RDV existants.
// Toutes les dates sont des chaînes locales (heure de Paris) : "YYYY-MM-DD" / "YYYY-MM-DD HH:MM:SS".
const db = require('../db');
const config = require('../config');

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
// 1 = lundi … 7 = dimanche
const isoWeekday = (s) => ((parseDate(s).getDay() + 6) % 7) + 1;

function bookingWindow() {
  const now = new Date();
  const earliest = new Date(now.getTime() + config.booking.minNoticeHours * 3600e3);
  const lastDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + config.booking.maxDaysAhead);
  return { earliest, firstDate: dateStr(now), lastDate: dateStr(lastDay) };
}

async function loadContext(from, to) {
  const [hours, closures, appointments] = await Promise.all([
    db.query('SELECT weekday, start_time, end_time FROM opening_hours ORDER BY weekday, start_time'),
    db.query(
      'SELECT start_date, end_date, TIME_FORMAT(start_time, "%H:%i") AS start_time, TIME_FORMAT(end_time, "%H:%i") AS end_time FROM closures WHERE end_date >= ? AND start_date <= ?',
      [from, to]
    ),
    db.query(
      "SELECT start_at, end_at FROM appointments WHERE status <> 'annule' AND start_at < ? AND end_at > ?",
      [`${to} 23:59:59`, `${from} 00:00:00`]
    ),
  ]);
  return { hours, closures, appointments };
}

// Créneaux libres d'une journée (fonction pure)
function slotsForDay(day, ctx, win) {
  if (day < win.firstDate || day > win.lastDate) return [];
  const dayClosures = ctx.closures.filter((c) => day >= c.start_date && day <= c.end_date);
  if (dayClosures.some((c) => !c.start_time)) return []; // journée entière fermée
  const blocked = dayClosures.map((c) => [toMinutes(c.start_time), toMinutes(c.end_time)]);

  const dur = config.booking.slotMinutes;
  const wd = isoWeekday(day);
  const slots = [];

  for (const range of ctx.hours.filter((h) => h.weekday === wd)) {
    const end = toMinutes(range.end_time);
    for (let t = toMinutes(range.start_time); t + dur <= end; t += dur) {
      const time = fromMinutes(t);
      const start = `${day} ${time}:00`;
      const stop = `${day} ${fromMinutes(t + dur)}:00`;
      const [y, mo, d] = day.split('-').map(Number);
      if (new Date(y, mo - 1, d, Math.floor(t / 60), t % 60) < win.earliest) continue;
      if (blocked.some(([bs, be]) => t < be && t + dur > bs)) continue; // plage bloquée par le kiné
      const taken = ctx.appointments.some((a) => a.start_at < stop && a.end_at > start);
      if (!taken) slots.push(time);
    }
  }
  return slots;
}

async function slotsForDate(day) {
  const ctx = await loadContext(day, day);
  return slotsForDay(day, ctx, bookingWindow());
}

// { "2026-11-03": 9, "2026-11-04": 0, … } pour colorer le calendrier
async function monthAvailability(month) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = dateStr(new Date(y, m, 0));
  const ctx = await loadContext(first, last);
  const win = bookingWindow();
  const days = {};
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    const day = `${month}-${pad(d)}`;
    days[day] = slotsForDay(day, ctx, win).length;
  }
  return days;
}

function endTime(day, time, minutes = config.booking.slotMinutes) {
  const end = toMinutes(time) + minutes;
  if (end >= 24 * 60) return null; // ne déborde pas sur le lendemain
  return `${day} ${fromMinutes(end)}:00`;
}

// Le créneau [start, end[ chevauche-t-il un RDV actif ? (excludeId : RDV en cours de déplacement)
async function overlaps(start, end, excludeId = 0) {
  const row = await db.one(
    "SELECT id FROM appointments WHERE status <> 'annule' AND id <> ? AND start_at < ? AND end_at > ? LIMIT 1",
    [excludeId, end, start]
  );
  return !!row;
}

module.exports = { slotsForDate, monthAvailability, endTime, bookingWindow, overlaps };
