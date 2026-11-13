const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function initSchema(db) {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

module.exports = { initSchema };
