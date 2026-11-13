const path = require('node:path');

const rootDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(rootDir, '.env'), quiet: true });

if (!process.env.JWT_SECRET) {
  console.warn('[config] Brak JWT_SECRET w .env — używam domyślnego sekretu (tylko do developmentu!).');
}

module.exports = {
  rootDir,
  port: Number(process.env.PORT) || 3000,
  dbPath: path.resolve(rootDir, process.env.DB_PATH || 'data/database.sqlite'),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@mpk.local').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin123!',
  },
};
