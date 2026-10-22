const db = require('../db');

// Ajoute req.user si la session contient un utilisateur encore valide
async function loadUser(req, res, next) {
  try {
    if (req.session.userId) {
      req.user = await db.one(
        'SELECT id, first_name, last_name, email, phone, role, session_version FROM users WHERE id = ?',
        [req.session.userId]
      );
      // Compte supprimé, ou mot de passe changé depuis un autre appareil : session invalide
      if (!req.user || req.user.session_version !== req.session.sv) {
        req.user = null;
        delete req.session.userId;
        delete req.session.sv;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Connexion requise.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé au cabinet.' });
  next();
}

// Ouvre une session neuve (nouvel identifiant : évite la fixation de session)
function openSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.sv = user.session_version;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

module.exports = { loadUser, requireAuth, requireAdmin, openSession };
