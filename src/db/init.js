// npm run db:init           — tworzy tabele (istniejące dane zostają)
// npm run db:init -- --reset — usuwa plik bazy i tworzy go od nowa
const fs = require('node:fs');
const config = require('../config');

if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(config.dbPath + suffix, { force: true });
  }
  console.log(`Usunięto bazę: ${config.dbPath}`);
}

// connection.js otwiera (i w razie potrzeby tworzy) plik bazy — dlatego require dopiero tutaj
const db = require('./connection');
const { initSchema } = require('./schema');

initSchema(db);
db.close();
console.log(`Schemat bazy gotowy: ${config.dbPath}`);
