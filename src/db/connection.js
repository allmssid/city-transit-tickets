const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

// Jedno współdzielone połączenie dla całej aplikacji
const db = new Database(config.dbPath);
db.exec('PRAGMA foreign_keys = ON;');

module.exports = db;
