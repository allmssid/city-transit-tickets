const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const config = require('../config');
const HttpError = require('../utils/HttpError');

const findUserById = db.prepare(
  'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = ?'
);

// Wymaga nagłówka: Authorization: Bearer <token>. Ustawia req.user.
function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Brak tokena autoryzacji.');
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Token jest nieprawidłowy lub wygasł.');
  }

  const user = findUserById.get(Number(payload.sub));
  if (!user) {
    throw new HttpError(401, 'Użytkownik powiązany z tokenem nie istnieje.');
  }

  req.user = user;
  next();
}

// Używać zawsze PO requireAuth, np. router.get('/x', requireAuth, requireAdmin, handler)
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    throw new HttpError(403, 'Brak uprawnień administratora.');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
