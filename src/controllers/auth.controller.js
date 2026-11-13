const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const config = require('../config');
const HttpError = require('../utils/HttpError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt bierze pod uwagę tylko pierwsze 72 bajty
const NAME_MAX_LENGTH = 100;
const BCRYPT_ROUNDS = 10;

const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)'
);

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function optionalName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, NAME_MAX_LENGTH) : null;
}

// Dane użytkownika bezpieczne do wysłania na frontend (bez hasha hasła)
function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    createdAt: user.created_at,
  };
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// POST /api/auth/register  { email, password, firstName?, lastName? }
async function register(req, res) {
  const { email, password, firstName, lastName } = req.body ?? {};
  const normalizedEmail = normalizeEmail(email);

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new HttpError(400, 'Podaj poprawny adres e-mail.');
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new HttpError(400, 'Hasło jest za długie.');
  }
  if (findUserByEmail.get(normalizedEmail)) {
    throw new HttpError(409, 'Konto z tym adresem e-mail już istnieje.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let result;
  try {
    result = insertUser.run(normalizedEmail, passwordHash, optionalName(firstName), optionalName(lastName));
  } catch (err) {
    // Dwie równoczesne rejestracje na ten sam e-mail
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new HttpError(409, 'Konto z tym adresem e-mail już istnieje.');
    }
    throw err;
  }

  const user = findUserById.get(result.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: toPublicUser(user) });
}

// POST /api/auth/login  { email, password }
async function login(req, res) {
  const { email, password } = req.body ?? {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'Podaj e-mail i hasło.');
  }

  const user = findUserByEmail.get(normalizedEmail);
  const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;

  // Ten sam komunikat dla złego e-maila i złego hasła — nie zdradzamy, które konta istnieją
  if (!passwordOk) {
    throw new HttpError(401, 'Nieprawidłowy e-mail lub hasło.');
  }

  res.json({ token: signToken(user), user: toPublicUser(user) });
}

// GET /api/auth/me  (wymaga tokena)
function me(req, res) {
  res.json({ user: toPublicUser(req.user) });
}

module.exports = { register, login, me, toPublicUser };
