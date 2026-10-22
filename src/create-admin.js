// Crée (ou promeut) le compte administrateur du kiné.
// Usage : npm run create-admin -- email@exemple.fr "MotDePasse" Prénom Nom
const bcrypt = require('bcryptjs');
const db = require('./db');

(async () => {
  const [email, password, firstName = 'Admin', lastName = 'Cabinet'] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.log('Usage : npm run create-admin -- email@exemple.fr "MotDePasse(8+)" Prénom Nom');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const existing = await db.one('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing) {
    await db.query("UPDATE users SET role = 'admin', password_hash = ?, session_version = session_version + 1 WHERE id = ?", [hash, existing.id]);
    console.log(`✔ ${email} est maintenant administrateur (mot de passe mis à jour).`);
  } else {
    await db.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
      [firstName, lastName, email.toLowerCase(), hash]
    );
    console.log(`✔ Compte administrateur créé : ${email}`);
  }
  await db.pool.end();
})().catch((err) => {
  console.error('Erreur :', err.code === 'ECONNREFUSED' ? 'impossible de joindre MySQL/MariaDB (serveur démarré ?)' : (err.message || err.code));
  process.exit(1);
});
