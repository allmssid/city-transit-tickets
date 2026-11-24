const db = require('../db/connection');
const HttpError = require('../utils/HttpError');
const parseId = require('../utils/parseId');

const listActiveTicketTypes = db.prepare(
  'SELECT * FROM ticket_types WHERE is_active = 1 ORDER BY duration_minutes, is_reduced, id'
);
const findActiveTicketTypeById = db.prepare(
  'SELECT * FROM ticket_types WHERE id = ? AND is_active = 1'
);

// Dane typu biletu w formacie dla frontendu (camelCase, bez pól technicznych)
function toPublicTicketType(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceGrosze: row.price_grosze,
    durationMinutes: row.duration_minutes,
    isReduced: row.is_reduced === 1,
  };
}

// GET /api/ticket-types — tylko typy aktywne (dostępne w sprzedaży)
function list(req, res) {
  const ticketTypes = listActiveTicketTypes.all().map(toPublicTicketType);
  res.json({ ticketTypes });
}

// GET /api/ticket-types/:id
function getById(req, res) {
  const ticketType = findActiveTicketTypeById.get(parseId(req.params.id));
  if (!ticketType) {
    throw new HttpError(404, 'Nie znaleziono takiego rodzaju biletu.');
  }
  res.json({ ticketType: toPublicTicketType(ticketType) });
}

module.exports = { list, getById, toPublicTicketType };
