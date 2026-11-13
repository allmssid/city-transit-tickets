const app = require('./app');
const config = require('./config');
const db = require('./db/connection');
const { initSchema } = require('./db/schema');

// Tworzy brakujące tabele przy starcie (CREATE TABLE IF NOT EXISTS)
initSchema(db);

app.listen(config.port, () => {
  console.log(`Serwer działa: http://localhost:${config.port}`);
  console.log(`Health check:  http://localhost:${config.port}/api/health`);
});
