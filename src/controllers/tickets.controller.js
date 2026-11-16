const db = require('../db/connection');
const HttpError = require('../utils/HttpError');

const PAYMENT_METHODS = ['blik', 'card', 'transfer'];

const findTicketTypeById = db.prepare('SELECT * FROM ticket_types WHERE id = ?');
const insertTicket = db.prepare(`
  INSERT INTO tickets (user_id, ticket_type_id, price_paid_grosze, status)
  VALUES (?, ?, ?, 'purchased')
`);
const insertPayment = db.prepare(`
  INSERT INTO payments (ticket_id, amount_grosze, method, status)
  VALUES (?, ?, ?, 'completed')
`);
const findPaymentById = db.prepare('SELECT * FROM payments WHERE id = ?');

// Bilet razem z danymi swojego typu (nazwa, czas ważności)
const TICKET_WITH_TYPE_SQL = `
  SELECT t.id, t.user_id, t.price_paid_grosze, t.status,
         t.purchased_at, t.activated_at, t.expires_at,
         tt.id AS type_id, tt.name AS type_name, tt.description AS type_description,
         tt.duration_minutes AS type_duration_minutes, tt.is_reduced AS type_is_reduced
  FROM tickets t
  JOIN ticket_types tt ON tt.id = t.ticket_type_id
`;
const findTicketWithTypeById = db.prepare(`${TICKET_WITH_TYPE_SQL} WHERE t.id = ?`);
const listTicketsWithTypeByUser = db.prepare(
  `${TICKET_WITH_TYPE_SQL} WHERE t.user_id = ? ORDER BY t.purchased_at DESC, t.id DESC`
);

// Bilet w formacie dla frontendu — ten sam kształt w każdym endpointcie
function toPublicTicket(row) {
  return {
    id: row.id,
    status: row.status,
    pricePaidGrosze: row.price_paid_grosze,
    purchasedAt: row.purchased_at,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
    ticketType: {
      id: row.type_id,
      name: row.type_name,
      description: row.type_description,
      durationMinutes: row.type_duration_minutes,
      isReduced: row.type_is_reduced === 1,
    },
  };
}

function toPublicPayment(row) {
  return {
    id: row.id,
    method: row.method,
    status: row.status,
    amountGrosze: row.amount_grosze,
    createdAt: row.created_at,
  };
}

// Zakup biletu: bilet + płatność w jednej transakcji.
// Cena odczytywana wewnątrz transakcji, żeby równoczesna zmiana cennika nie dała niespójnych kwot.
const purchaseTicket = db.transaction((userId, ticketTypeId, paymentMethod) => {
  const ticketType = findTicketTypeById.get(ticketTypeId);
  if (!ticketType) {
    throw new HttpError(404, 'Nie znaleziono takiego rodzaju biletu.');
  }
  if (ticketType.is_active !== 1) {
    throw new HttpError(400, 'Ten rodzaj biletu został wycofany ze sprzedaży.');
  }

  const ticketId = insertTicket.run(userId, ticketType.id, ticketType.price_grosze).lastInsertRowid;
  const paymentId = insertPayment.run(ticketId, ticketType.price_grosze, paymentMethod).lastInsertRowid;

  return { ticketId, paymentId };
});

// POST /api/tickets/purchase  { ticketTypeId, paymentMethod: 'blik' | 'card' | 'transfer' }
function purchase(req, res) {
  const { ticketTypeId, paymentMethod } = req.body ?? {};

  if (!Number.isInteger(ticketTypeId) || ticketTypeId <= 0) {
    throw new HttpError(400, 'Pole ticketTypeId musi być dodatnią liczbą całkowitą.');
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new HttpError(400, `Pole paymentMethod musi mieć wartość: ${PAYMENT_METHODS.join(', ')}.`);
  }

  const { ticketId, paymentId } = purchaseTicket(req.user.id, ticketTypeId, paymentMethod);

  res.status(201).json({
    ticket: toPublicTicket(findTicketWithTypeById.get(ticketId)),
    payment: toPublicPayment(findPaymentById.get(paymentId)),
  });
}

// GET /api/tickets/me — bilety zalogowanego użytkownika, najnowsze pierwsze
function listMine(req, res) {
  const tickets = listTicketsWithTypeByUser.all(req.user.id).map(toPublicTicket);
  res.json({ tickets });
}

module.exports = { purchase, listMine, toPublicTicket };
