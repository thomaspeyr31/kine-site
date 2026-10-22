// Petites aides communes aux routes

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+0-9 ().-]{6,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function str(value, { max = 255, required = false, label = 'Champ' } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new HttpError(400, `${label} obligatoire.`);
  if (v.length > max) throw new HttpError(400, `${label} trop long (${max} caractères max).`);
  return v;
}

function email(value) {
  const v = str(value, { max: 190, required: true, label: 'E-mail' }).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new HttpError(400, 'Adresse e-mail invalide.');
  return v;
}

function phone(value, required = true) {
  const v = str(value, { max: 30, required, label: 'Téléphone' });
  if (v && !PHONE_RE.test(v)) throw new HttpError(400, 'Numéro de téléphone invalide.');
  return v || null;
}

function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 100) {
    throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  }
  return value;
}

function int(value, { min = 0, max = 1e9, label = 'Nombre' } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} invalide.`);
  return n;
}

// Enveloppe les handlers async pour transmettre les erreurs à Express
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, str, email, phone, password, int, wrap, DATE_RE, TIME_RE };
