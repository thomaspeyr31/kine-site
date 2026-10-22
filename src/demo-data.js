// Données de démonstration (DÉVELOPPEMENT UNIQUEMENT) : patients, RDV passés et à venir,
// un achat et un journal de séances pour la patiente de test. Utilisé par "npm run db:init".
const crypto = require('crypto');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMin = (hhmm, m) => {
  const [h, mi] = hhmm.split(':').map(Number);
  const t = h * 60 + mi + m;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};
const token = () => crypto.randomBytes(24).toString('hex');

// Jours ouvrés (lun-ven) à partir d'aujourd'hui + offset (négatif = passé)
function businessDays(fromOffset, count) {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() + fromOffset);
  while (out.length < count) {
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) out.push(ymd(d));
    d.setDate(d.getDate() + (fromOffset < 0 ? -1 : 1));
  }
  return out;
}

async function insertDemoData(conn, slotMinutes = 45) {
  const [[lea]] = await conn.query("SELECT id FROM users WHERE email = 'patient@test.fr'");

  const people = [
    { first_name: 'Léa', last_name: 'Durand', email: 'patient@test.fr', phone: '06 12 34 56 78', birth_date: '1992-04-18', user_id: lea?.id,
      notes: 'Coureuse (semi-marathon). Entorse cheville droite en juin.\nBon niveau d\'autonomie, à orienter vers le programme cheville.' },
    { first_name: 'Marc', last_name: 'Petit', email: 'marc.petit@exemple.fr', phone: '06 22 33 44 55', birth_date: '1978-11-02',
      notes: 'Lombalgie chronique, travail de bureau. Appréhension du mouvement.\nObjectif : reprise du tennis.' },
    { first_name: 'Sophie', last_name: 'Bernard', email: 'sophie.bernard@exemple.fr', phone: '07 11 22 33 44', birth_date: '1965-02-27',
      notes: 'Post-opératoire épaule gauche (réparation coiffe), chirurgien Dr Lambert.\nProtocole : pas de rotation externe active avant S6.' },
    { first_name: 'Julien', last_name: 'Moreau', email: null, phone: '06 98 76 54 32', birth_date: '2001-07-09',
      notes: 'Footballeur, LCA genou droit opéré. Pas d\'e-mail : prévenir par SMS.' },
    { first_name: 'Nadia', last_name: 'Haddad', email: 'nadia.h@exemple.fr', phone: '06 45 67 89 01', birth_date: '1988-09-14', notes: null },
  ];
  const ids = [];
  for (const p of people) {
    const [r] = await conn.query('INSERT INTO patients SET ?', [{ ...p, user_id: p.user_id || null }]);
    ids.push(r.insertId);
  }

  const appt = (pi, day, time, type, status, extra = {}) => {
    const p = people[pi];
    return {
      patient_id: ids[pi], user_id: p.user_id || null, type, source: extra.source || 'web',
      first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone, birth_date: p.birth_date,
      has_prescription: extra.prescription ? 1 : 0, message: extra.message || null, staff_notes: extra.notes || null,
      start_at: `${day} ${time}:00`, end_at: `${day} ${addMin(time, slotMinutes)}:00`, status, cancel_token: token(),
    };
  };

  const past = businessDays(-1, 4);  // 4 jours ouvrés passés
  const next = businessDays(1, 6);   // 6 jours ouvrés à venir
  const rows = [
    // Historique
    appt(1, past[3], '09:15', 'bilan', 'termine', { prescription: true, message: 'Douleur lombaire depuis 2 mois, pire le matin.', notes: 'Bilan : raideur lombaire, Schober 3 cm. Pas de signe neurologique. Début gainage + mobilité.' }),
    appt(2, past[2], '14:00', 'seance', 'termine', { prescription: true, source: 'cabinet', notes: 'S4 post-op. Mobilité passive OK (flexion 120°). Douleur 3/10.' }),
    appt(3, past[1], '10:45', 'seance', 'absent', { source: 'cabinet' }),
    appt(1, past[0], '17:00', 'seance', 'termine', { notes: 'Progrès nets, douleur 2/10. Ajout du pont fessier unipodal.' }),
    // À venir
    appt(0, next[0], '09:15', 'bilan', 'confirme', { prescription: true, message: 'Entorse cheville droite il y a 3 mois, sensation d\'instabilité en courant.' }),
    appt(2, next[0], '14:00', 'seance', 'confirme', { prescription: true, source: 'cabinet' }),
    appt(4, next[0], '16:15', 'bilan', 'confirme', { message: 'Douleur au genou en descendant les escaliers.' }),
    appt(1, next[1], '10:00', 'seance', 'confirme', {}),
    appt(3, next[1], '17:45', 'seance', 'confirme', { prescription: true, source: 'cabinet', message: 'Rééducation LCA S10' }),
    appt(2, next[2], '14:45', 'seance', 'confirme', { prescription: true, source: 'cabinet' }),
    appt(4, next[3], '08:30', 'suivi', 'confirme', { message: 'Point sur le programme genou.' }),
    appt(0, next[4], '11:30', 'seance', 'confirme', {}),
  ];
  for (const r of rows) await conn.query('INSERT INTO appointments SET ?', [r]);
}

module.exports = { insertDemoData };
