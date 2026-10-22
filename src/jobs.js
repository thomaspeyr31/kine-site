// Tâches de fond lancées par le serveur :
//  - toutes les 15 min : e-mails de rappel des RDV du lendemain
//  - toutes les 6 h    : purge RGPD et nettoyage
// Sans risque si plusieurs instances tournent (opérations idempotentes).
const db = require('./db');
const config = require('./config');
const { sendReminders } = require('./routes/appointments');

async function purge() {
  const months = config.retention.appointmentsMonths;
  const r = await db.query('DELETE FROM appointments WHERE start_at < NOW() - INTERVAL ? MONTH', [months]);
  await db.query('DELETE FROM password_resets WHERE expires_at < NOW() - INTERVAL 1 DAY');
  // Fiches sans compte ni rendez-vous restant (tous purgés) : supprimées aussi
  await db.query(
    `DELETE p FROM patients p
     WHERE p.user_id IS NULL AND p.created_at < NOW() - INTERVAL ? MONTH
       AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id)`,
    [months]
  );
  // Paiements abandonnés (Stripe expire les sessions au bout de 24 h)
  await db.query("UPDATE orders SET status = 'cancelled' WHERE status = 'pending' AND created_at < NOW() - INTERVAL 2 DAY");
  if (r.affectedRows) console.log(`🧹 ${r.affectedRows} rendez-vous de plus de ${months} mois supprimés (RGPD)`);
}

function every(ms, name, fn) {
  const run = () => fn().catch((err) => console.error(`Tâche « ${name} » en échec :`, err.message));
  setTimeout(run, 10_000).unref(); // premier passage peu après le démarrage
  return setInterval(run, ms).unref();
}

function start() {
  every(15 * 60e3, 'rappels', async () => {
    const n = await sendReminders();
    if (n) console.log(`⏰ ${n} rappel(s) de rendez-vous envoyé(s)`);
  });
  every(6 * 3600e3, 'purge', purge);
}

module.exports = { start, purge };
