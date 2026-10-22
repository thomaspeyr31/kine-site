// Installe la base si elle est vide, sinon applique les évolutions — sans jamais perdre de données.
// Usage : npm run db:migrate   (lancé automatiquement au démarrage du conteneur Docker)
// Évolutions : chaque fichier database/migrations/NNN-description.sql n'est exécuté qu'une fois, dans l'ordre.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

const dir = path.join(__dirname, '..', 'database');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Attend que la base réponde (utile au démarrage d'un serveur ou d'un conteneur)
async function connect() {
  for (let i = 1; ; i++) {
    try {
      return await mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4' });
    } catch (err) {
      if (i >= 30 || !['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code)) throw err;
      if (i === 1) console.log('… en attente de la base de données');
      await sleep(2000);
    }
  }
}

(async () => {
  const conn = await connect();
  const migDir = path.join(dir, 'migrations');
  const files = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort() : [];

  const [[installed]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'");
  if (!installed.n) {
    // Base vide : installation complète (sans données de démonstration)
    await conn.query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
    if (files.length) await conn.query('INSERT INTO schema_migrations (name) VALUES ?', [files.map((f) => [f])]);
    console.log('✔ Base installée (tables créées)');
    if (process.env.SEED_DEMO === '1') {
      await conn.query(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8'));
      console.log('✔ Données de démonstration insérées (SEED_DEMO=1)');
    }
    await conn.end();
    return;
  }

  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(190) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [rows] = await conn.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    console.log(`→ ${file}`);
    await conn.query(fs.readFileSync(path.join(migDir, file), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    count++;
  }
  console.log(count ? `✔ ${count} migration(s) appliquée(s)` : '✔ Base à jour');
  await conn.end();
})().catch((err) => {
  console.error('Erreur base de données :', err.code === 'ECONNREFUSED' ? 'impossible de joindre MySQL/MariaDB' : (err.message || err.code));
  process.exit(1);
});
