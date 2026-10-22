const mysql = require('mysql2/promise');
const config = require('./config');

// dateStrings : les dates restent des chaînes "YYYY-MM-DD HH:MM:SS" (heure de Paris),
// ce qui évite tout décalage de fuseau entre Node et MySQL.
const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,
  idleTimeout: 10 * 60 * 1000, // recycle les connexions inactives (suit le changement d'heure été/hiver)
  enableKeepAlive: true,
});

// Décalage actuel de l'heure locale (Paris) : "+02:00" en été, "+01:00" en hiver
function localOffset() {
  const min = -new Date().getTimezoneOffset();
  const sign = min >= 0 ? '+' : '-';
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// Chaque connexion travaille à l'heure de Paris, même si le serveur MySQL est en UTC
// (NOW(), CURDATE(), CURRENT_TIMESTAMP). Utilise le fuseau nommé s'il est chargé dans MySQL,
// sinon le décalage horaire actuel.
pool.pool.on('connection', (conn) => {
  conn.query(
    "SET time_zone = IF(CONVERT_TZ('2000-01-01 00:00:00', 'UTC', ?) IS NULL, ?, ?)",
    [process.env.TZ, localOffset(), process.env.TZ]
  );
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction, localOffset };
