const HttpError = require('./HttpError');

// Parsuje parametr :id z URL — musi być dodatnią liczbą całkowitą
function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Identyfikator musi być dodatnią liczbą całkowitą.');
  }
  return id;
}

module.exports = parseId;
