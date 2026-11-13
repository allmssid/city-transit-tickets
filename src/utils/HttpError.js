// Błąd z kodem HTTP — rzucony w kontrolerze trafia do errorHandlera
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

module.exports = HttpError;
