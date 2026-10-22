const express = require('express');
const db = require('../db');
const { HttpError, wrap } = require('../lib/http');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

const LIST_FIELDS = `p.id, p.slug, p.title, p.body_area, p.level, p.short_description,
  p.duration_weeks, p.sessions_per_week, p.price_cents`;

async function ownsProgram(user, programId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!(await db.one(
    "SELECT id FROM orders WHERE user_id = ? AND program_id = ? AND status = 'paid' LIMIT 1",
    [user.id, programId]
  ));
}

// Catalogue public
router.get('/', wrap(async (req, res) => {
  const programs = await db.query(
    `SELECT ${LIST_FIELDS}, (SELECT COUNT(*) FROM program_exercises e WHERE e.program_id = p.id) AS exercise_count
     FROM programs p WHERE p.is_published = 1 ORDER BY p.id`
  );
  res.json({ programs });
}));

// Fiche d'un programme (sans le détail des exercices)
router.get('/:slug', wrap(async (req, res) => {
  const program = await db.one(
    `SELECT ${LIST_FIELDS}, p.description FROM programs p WHERE p.slug = ? AND p.is_published = 1`,
    [req.params.slug]
  );
  if (!program) throw new HttpError(404, 'Programme introuvable.');
  // Aperçu : uniquement le nom des exercices de la 1re semaine
  const preview = await db.query(
    'SELECT name FROM program_exercises WHERE program_id = ? AND week_number = 1 ORDER BY position',
    [program.id]
  );
  const owned = await ownsProgram(req.user, program.id);
  res.json({ program, preview: preview.map((e) => e.name), owned });
}));

// Contenu complet : réservé aux acheteurs
router.get('/:slug/content', requireAuth, wrap(async (req, res) => {
  const program = await db.one('SELECT id, slug, title, description, duration_weeks, sessions_per_week FROM programs WHERE slug = ?', [req.params.slug]);
  if (!program) throw new HttpError(404, 'Programme introuvable.');
  if (!(await ownsProgram(req.user, program.id))) throw new HttpError(403, 'Programme non acheté.');
  const exercises = await db.query(
    `SELECT e.id, e.week_number, e.name, e.instructions, e.sets, e.reps, e.rest_seconds, e.video_url,
            (pp.user_id IS NOT NULL) AS done
     FROM program_exercises e
     LEFT JOIN program_progress pp ON pp.exercise_id = e.id AND pp.user_id = ?
     WHERE e.program_id = ? ORDER BY e.week_number, e.position, e.id`,
    [req.user.id, program.id]
  );
  res.json({ program, exercises: exercises.map((e) => ({ ...e, done: !!e.done })) });
}));

module.exports = router;
module.exports.ownsProgram = ownsProgram;
