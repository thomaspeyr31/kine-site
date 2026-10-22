// Invitation calendrier (.ics) : "Ajouter à mon agenda" pour Google Agenda, Apple Calendrier, Outlook…
const config = require('../config');

// "2026-11-03 08:30:00" (heure de Paris) → "20261103T073000Z" (UTC)
const toUtc = (local) => new Date(String(local).replace(' ', 'T')).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Échappement des textes iCalendar
const txt = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lignes de 75 octets maximum (RFC 5545)
const fold = (line) => {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
};

/**
 * @param {object} a  RDV : id, start_at, end_at, cancel_token
 * @param {string} title
 * @param {{ cancelled?: boolean, description?: string }} [opts]
 */
function appointmentIcs(a, title, { cancelled = false, description = '' } = {}) {
  const host = config.baseUrl.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${txt(config.site.name)}//Rendez-vous//FR`,
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:rdv-${a.id || a.cancel_token}@${host}`,
    `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${toUtc(a.start_at)}`,
    `DTEND:${toUtc(a.end_at)}`,
    `SUMMARY:${txt(title)}`,
    `LOCATION:${txt(`${config.site.name}, ${config.site.address}`)}`,
    `DESCRIPTION:${txt(description)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Rendez-vous kiné',
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { appointmentIcs };
