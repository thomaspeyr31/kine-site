// Fiches patients : retrouve la fiche d'une personne (compte, e-mail ou téléphone + nom) ou la crée.
// Chaque RDV est rattaché à une fiche : le kiné voit tout l'historique d'un patient au même endroit.
const db = require('../db');

const normPhone = (p) => (p ? String(p).replace(/[^\d+]/g, '') : null);

// conn : connexion (transaction) ou module db. Renvoie l'id de la fiche.
async function findOrCreatePatient(conn, p) {
  // module db → renvoie directement les lignes ; connexion mysql2 → [lignes, champs]
  const q = conn === db ? db.query : async (sql, params) => (await conn.query(sql, params))[0];
  const email = p.email ? p.email.toLowerCase() : null;
  const phone = normPhone(p.phone);
  let row = null;

  if (p.userId) [row] = await q('SELECT * FROM patients WHERE user_id = ?', [p.userId]);
  if (!row && email) [row] = await q('SELECT * FROM patients WHERE email = ? ORDER BY user_id IS NULL, id LIMIT 1', [email]);
  if (!row && phone && p.lastName) {
    [row] = await q(
      "SELECT * FROM patients WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '.', ''), '-', '') = ? AND last_name = ? LIMIT 1",
      [phone, p.lastName]
    );
  }

  if (row) {
    // Complète la fiche avec les informations manquantes (sans écraser ce que le kiné a corrigé)
    const patch = {};
    if (p.userId && !row.user_id) patch.user_id = p.userId;
    if (!row.email && email) patch.email = email;
    if (!row.phone && p.phone) patch.phone = p.phone;
    if (!row.birth_date && p.birthDate) patch.birth_date = p.birthDate;
    if (Object.keys(patch).length) {
      try {
        await q('UPDATE patients SET ? WHERE id = ?', [patch, row.id]);
      } catch (err) {
        // Le compte est déjà lié à une autre fiche : on ne lie pas celle-ci
        if (err.code !== 'ER_DUP_ENTRY') throw err;
        delete patch.user_id;
        if (Object.keys(patch).length) await q('UPDATE patients SET ? WHERE id = ?', [patch, row.id]);
      }
    }
    return row.id;
  }

  const r = await q('INSERT INTO patients SET ?', [{
    user_id: p.userId || null,
    first_name: p.firstName,
    last_name: p.lastName,
    email,
    phone: p.phone || null,
    birth_date: p.birthDate || null,
  }]);
  return r.insertId;
}

module.exports = { findOrCreatePatient, normPhone };
