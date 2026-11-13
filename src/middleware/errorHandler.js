const HttpError = require('../utils/HttpError');

function notFound(req, res, next) {
  next(new HttpError(404, `Nie znaleziono: ${req.method} ${req.originalUrl}`));
}

// Wszystkie błędy zwracane są w jednym formacie: { "error": "komunikat" }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Nieprawidłowy format JSON w treści zapytania.' });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: 'Wewnętrzny błąd serwera.' });
}

module.exports = { notFound, errorHandler };
