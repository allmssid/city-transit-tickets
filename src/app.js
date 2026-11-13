const path = require('node:path');
const express = require('express');
const cors = require('cors');

const config = require('./config');
const apiRouter = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// CORS: lista adresów z .env, a gdy jest pusta — dowolny adres (development)
app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true }));
app.use(express.json());

// Frontend (HTML/CSS/JS) serwowany z katalogu public/
app.use(express.static(path.join(config.rootDir, 'public')));

// REST API
app.use('/api', apiRouter);
app.use('/api', notFound);

app.use(errorHandler);

module.exports = app;
