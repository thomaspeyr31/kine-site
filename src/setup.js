// Installation en une commande (Windows, Mac, Linux) : npm run setup
//  1. crée le fichier .env s'il n'existe pas
//  2. se connecte à MySQL / MariaDB en administrateur (root) et crée la base + l'utilisateur du site
//  3. crée les tables, les programmes, les patients et les comptes de démonstration
// Aucun outil en ligne de commande MySQL n'est nécessaire (fonctionne avec XAMPP, WAMP, MySQL Installer, Homebrew…).
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');

// ---------- 1. Fichier .env ----------
if (!fs.existsSync(envFile)) {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
    // 127.0.0.1 plutôt que localhost : évite les soucis IPv6 (::1) fréquents sous Windows
    .replace(/^DB_HOST=localhost$/m, 'DB_HOST=127.0.0.1');
  fs.writeFileSync(envFile, example);
  console.log('✔ Fichier .env créé (configuration de développement)');
}

const mysql = require('mysql2/promise');
const config = require('./config');

// Une seule interface de saisie pour tout le script (les réponses tapées ou collées ne se perdent pas)
let rl = null;
let muted = false;
const pending = [];
const lines = [];
function input() {
  if (rl) return rl;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  rl._writeToOutput = (str) => { if (!muted) rl.output.write(str); else if (/[\r\n]/.test(str)) rl.output.write('\n'); };
  rl.on('line', (line) => (pending.length ? pending.shift()(line) : lines.push(line)));
  rl.on('close', () => { while (pending.length) pending.shift()(''); rl.closed = true; });
  return rl;
}
function ask(question, { hidden = false } = {}) {
  const r = input();
  process.stdout.write(question);
  if (lines.length) { const l = lines.shift(); if (!process.stdin.isTTY) process.stdout.write('\n'); return Promise.resolve(l); }
  if (r.closed) { process.stdout.write('\n'); return Promise.resolve(''); }
  muted = hidden && !!process.stdin.isTTY;
  return new Promise((resolve) => pending.push((l) => { muted = false; if (!process.stdin.isTTY) process.stdout.write('\n'); resolve(l); }));
}
function closeInput() { if (rl && !rl.closed) rl.close(); }

const HELP_CONNECT = `
  MySQL / MariaDB ne répond pas sur ${config.db.host}:${config.db.port}.
  → Avec XAMPP : ouvrez le « XAMPP Control Panel » et cliquez sur « Start » en face de MySQL.
  → Avec MySQL Installer (Windows) : le service « MySQL80 » doit être démarré (Services Windows).
  → Sur Mac (Homebrew) : brew services start mariadb   (ou mysql)
  Puis relancez l'installation.`;

async function connectAsAdmin() {
  const user = process.env.DB_ROOT_USER || 'root';
  let password = process.env.DB_ROOT_PASSWORD ?? '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await mysql.createConnection({ host: config.db.host, port: config.db.port, user, password, multipleStatements: true });
    } catch (err) {
      if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(err.code)) {
        console.error(`✘ Connexion impossible.${HELP_CONNECT}`);
        process.exit(1);
      }
      const denied = [1045, 1698].includes(err.errno) || /access denied/i.test(err.message || '');
      if (!denied || attempt === 4) throw err;
      if (attempt > 1) console.log('  Mot de passe incorrect, réessayez.');
      password = await ask(`Mot de passe de l'utilisateur MySQL « ${user} » (laisser vide avec XAMPP) : `, { hidden: true });
    }
  }
  return null;
}

(async () => {
  console.log(`\n→ Connexion à MySQL / MariaDB (${config.db.host}:${config.db.port}) en administrateur…`);
  const admin = await connectAsAdmin();
  const [[{ v }]] = await admin.query('SELECT VERSION() AS v');
  console.log(`✔ Connecté (${v})`);

  // ---------- 2. Base + utilisateur du site ----------
  const { database, user, password } = config.db;
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  // Plusieurs "hôtes" : selon l'installation, la connexion locale arrive par localhost, 127.0.0.1 ou ::1
  for (const host of ['localhost', '127.0.0.1', '::1']) {
    await admin.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [user, host, password]);
    await admin.query('ALTER USER ?@? IDENTIFIED BY ?', [user, host, password]);
    await admin.query(`GRANT ALL PRIVILEGES ON ${mysql.escapeId(database)}.* TO ?@?`, [user, host]);
  }
  await admin.query('FLUSH PRIVILEGES');
  console.log(`✔ Base « ${database} » et utilisateur « ${user} » prêts`);

  const [[{ n }]] = await admin.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'users'", [database]
  );
  await admin.end();

  // ---------- 3. Tables + données de démonstration ----------
  if (n && !process.argv.includes('--reset')) {
    const answer = await ask('La base contient déjà des données. La remettre à zéro avec les données de démo ? (o/N) ');
    if (!/^o/i.test(answer.trim())) {
      console.log('✔ Données existantes conservées.');
      closeInput();
      return done();
    }
  }
  closeInput();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'init-db.js')], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status || 1);
  done();
})().catch((err) => {
  const denied = [1045, 1698].includes(err.errno);
  console.error('✘ Erreur :', err.message || err.code);
  if (denied) console.error('  Identifiants administrateur refusés. Avec XAMPP, laissez le mot de passe vide ; avec MySQL Installer, utilisez le mot de passe « root » choisi à l\'installation.');
  process.exit(1);
});

function done() {
  console.log('\n✔ Installation terminée. Lancez le site avec :  npm start   puis ouvrez http://localhost:3000\n');
}
