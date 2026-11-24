const db = require('../db/connection');
const HttpError = require('../utils/HttpError');
const parseId = require('../utils/parseId');
const { toIsoUtc } = require('../utils/dates');

const PAYMENT_METHODS = ['blik', 'card', 'transfer'];
const TICKET_STATUSES = ['purchased', 'active', 'expired'];

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
const TICKET_ORDER_SQL = 'ORDER BY t.purchased_at DESC, t.id DESC';
const findTicketWithTypeById = db.prepare(`${TICKET_WITH_TYPE_SQL} WHERE t.id = ?`);
const listTicketsWithTypeByUser = db.prepare(
  `${TICKET_WITH_TYPE_SQL} WHERE t.user_id = ? ${TICKET_ORDER_SQL}`
);
const listTicketsWithTypeByUserAndStatus = db.prepare(
  `${TICKET_WITH_TYPE_SQL} WHERE t.user_id = ? AND t.status = ? ${TICKET_ORDER_SQL}`
);

// Bilety aktywne, którym minął czas ważności, przechodzą w 'expired'.
// Wywoływane przed każdym odczytem biletów, więc nie potrzebujemy crona.
const markExpiredStmt = db.prepare(`
  UPDATE tickets SET status = 'expired'
  WHERE status = 'active' AND expires_at <= datetime('now')
`);

// Aktywacja w jednym zapytaniu. Warunek status = 'purchased' w WHERE chroni przed
// podwójną aktywacją (np. dwa szybkie kliknięcia). datetime('now') ma tę samą wartość
// w obrębie jednego zapytania, więc expires_at = activated_at + duration_minutes co do sekundy.
const activateTicketStmt = db.prepare(`
  UPDATE tickets
  SET status = 'active',
      activated_at = datetime('now'),
      expires_at = datetime('now', '+' || (
        SELECT duration_minutes FROM ticket_types WHERE id = tickets.ticket_type_id
      ) || ' minutes')
  WHERE id = ? AND user_id = ? AND status = 'purchased'
`);
const findOwnTicketStatus = db.prepare('SELECT status FROM tickets WHERE id = ? AND user_id = ?');

function markExpired() {
  return markExpiredStmt.run().changes;
}

// Bilet w formacie dla frontendu — ten sam kształt w każdym endpointcie
function toPublicTicket(row) {
  return {
    id: row.id,
    status: row.status,
    pricePaidGrosze: row.price_paid_grosze,
    purchasedAt: toIsoUtc(row.purchased_at),
    activatedAt: toIsoUtc(row.activated_at),
    expiresAt: toIsoUtc(row.expires_at),
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
    createdAt: toIsoUtc(row.created_at),
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

// GET /api/tickets/me?status=purchased|active|expired — bilety zalogowanego, najnowsze pierwsze
function listMine(req, res) {
  const { status } = req.query;
  if (status !== undefined && !TICKET_STATUSES.includes(status)) {
    throw new HttpError(400, `Parametr status musi mieć wartość: ${TICKET_STATUSES.join(', ')}.`);
  }

  markExpired();
  const rows = status
    ? listTicketsWithTypeByUserAndStatus.all(req.user.id, status)
    : listTicketsWithTypeByUser.all(req.user.id);

  res.json({ tickets: rows.map(toPublicTicket) });
}

// POST /api/tickets/:id/activate — aktywacja własnego, kupionego biletu
function activate(req, res) {
  const ticketId = parseId(req.params.id);

  markExpired();
  const { changes } = activateTicketStmt.run(ticketId, req.user.id);

  if (changes === 0) {
    const ticket = findOwnTicketStatus.get(ticketId, req.user.id);
    // Cudzy bilet traktujemy jak nieistniejący — nie zdradzamy, że takie id istnieje
    if (!ticket) {
      throw new HttpError(404, 'Nie znaleziono biletu.');
    }
    if (ticket.status === 'active') {
      throw new HttpError(409, 'Bilet jest już aktywny.');
    }
    throw new HttpError(409, 'Bilet wygasł i nie może zostać ponownie aktywowany.');
  }

  res.json({ ticket: toPublicTicket(findTicketWithTypeById.get(ticketId)) });
}

module.exports = { purchase, listMine, activate, markExpired, toPublicTicket };
