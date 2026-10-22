// Installation neuve : crée les tables puis insère les données de démo.
// Usage : npm run db:init             (schéma + démo)
//         npm run db:init -- --empty  (schéma seul, pour la production)
// ⚠️ SUPPRIME les tables existantes. Refusé en production sans --force.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

const dbError = (err) => (err.code === 'ECONNREFUSED'
  ? 'impossible de joindre MySQL/MariaDB (serveur démarré ?)'
  : (err.message || err.code));

(async () => {
  if (config.isProd && !process.argv.includes('--force')) {
    console.error('Refusé : db:init efface toutes les données. En production, utilisez "npm run db:migrate".');
    console.error('db:migrate installe aussi la base si elle est vide (première mise en ligne).');
    process.exit(1);
  }
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4' });
  const dir = path.join(__dirname, '..', 'database');
  await conn.query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
  console.log('✔ Tables créées');

  // Le schéma est à jour : les migrations existantes sont considérées comme appliquées
  const migDir = path.join(dir, 'migrations');
  const migrations = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')) : [];
  if (migrations.length) await conn.query('INSERT INTO schema_migrations (name) VALUES ?', [migrations.map((m) => [m])]);

  if (!process.argv.includes('--empty')) {
    await conn.query(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8'));
    console.log('✔ Données de démonstration insérées');
  }
  await conn.end();
  console.log('→ Créez maintenant le compte du kiné : npm run create-admin -- email "MotDePasse" Prénom Nom');
})().catch((err) => {
  console.error('Erreur :', dbError(err));
  process.exit(1);
});
