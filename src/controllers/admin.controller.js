const db = require('../db/connection');
const HttpError = require('../utils/HttpError');
const { toPublicTicketType, parseId } = require('./ticketTypes.controller');
const { toPublicTicket } = require('./tickets.controller');

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const PRICE_MAX_GROSZE = 100000; // 1000 zł
const DURATION_MAX_MINUTES = 365 * 24 * 60; // rok
const TICKET_STATUSES = ['purchased', 'active', 'expired'];
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

// ---------------------------------------------------------------------------
// Walidacja
// ---------------------------------------------------------------------------

function validateName(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'Pole name jest wymagane.');
  }
  if (value.trim().length > NAME_MAX_LENGTH) {
    throw new HttpError(400, `Pole name może mieć najwyżej ${NAME_MAX_LENGTH} znaków.`);
  }
  return value.trim();
}

function validateDescription(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Pole description musi być tekstem.');
  }
  if (value.trim().length > DESCRIPTION_MAX_LENGTH) {
    throw new HttpError(400, `Pole description może mieć najwyżej ${DESCRIPTION_MAX_LENGTH} znaków.`);
  }
  return value.trim() || null;
}

function validatePrice(value) {
  if (!Number.isInteger(value) || value < 0 || value > PRICE_MAX_GROSZE) {
    throw new HttpError(400, `Pole priceGrosze musi być liczbą całkowitą od 0 do ${PRICE_MAX_GROSZE} (cena w groszach).`);
  }
  return value;
}

function validateDuration(value) {
  if (!Number.isInteger(value) || value <= 0 || value > DURATION_MAX_MINUTES) {
    throw new HttpError(400, `Pole durationMinutes musi być liczbą całkowitą od 1 do ${DURATION_MAX_MINUTES}.`);
  }
  return value;
}

function validateBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `Pole ${field} musi mieć wartość true lub false.`);
  }
  return value ? 1 : 0;
}

// Pola, które admin może ustawić: nazwa w JSON -> kolumna w bazie + walidator
const EDITABLE_FIELDS = {
  name: { column: 'name', validate: validateName },
  description: { column: 'description', validate: validateDescription },
  priceGrosze: { column: 'price_grosze', validate: validatePrice },
  durationMinutes: { column: 'duration_minutes', validate: validateDuration },
  isReduced: { column: 'is_reduced', validate: (v) => validateBoolean(v, 'isReduced') },
};

// ---------------------------------------------------------------------------
// Rodzaje biletów
// ---------------------------------------------------------------------------

const TICKET_TYPE_WITH_SALES_SQL = `
  SELECT tt.*,
         (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id) AS tickets_sold
  FROM ticket_types tt
`;
const listAllTicketTypes = db.prepare(
  `${TICKET_TYPE_WITH_SALES_SQL} ORDER BY tt.is_active DESC, tt.duration_minutes, tt.is_reduced, tt.id`
);
const findTicketTypeById = db.prepare(`${TICKET_TYPE_WITH_SALES_SQL} WHERE tt.id = ?`);
const insertTicketType = db.prepare(`
  INSERT INTO ticket_types (name, description, price_grosze, duration_minutes, is_reduced)
  VALUES (@name, @description, @price_grosze, @duration_minutes, @is_reduced)
`);
const updateTicketTypeStatus = db.prepare(`
  UPDATE ticket_types SET is_active = ?, updated_at = datetime('now') WHERE id = ?
`);

// Rodzaj biletu w widoku admina: to samo co publicznie + pola zarządzania
function toAdminTicketType(row) {
  return {
    ...toPublicTicketType(row),
    isActive: row.is_active === 1,
    ticketsSold: row.tickets_sold,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getTicketTypeOr404(id) {
  const row = findTicketTypeById.get(id);
  if (!row) {
    throw new HttpError(404, 'Nie znaleziono takiego rodzaju biletu.');
  }
  return row;
}

// GET /api/admin/ticket-types — wszystkie, także wycofane, z liczbą sprzedanych biletów
function listTicketTypes(req, res) {
  res.json({ ticketTypes: listAllTicketTypes.all().map(toAdminTicketType) });
}

// POST /api/admin/ticket-types  { name, priceGrosze, durationMinutes, description?, isReduced? }
function createTicketType(req, res) {
  const body = req.body ?? {};

  const values = {
    name: validateName(body.name),
    description: validateDescription(body.description),
    price_grosze: validatePrice(body.priceGrosze),
    duration_minutes: validateDuration(body.durationMinutes),
    is_reduced: body.isReduced === undefined ? 0 : validateBoolean(body.isReduced, 'isReduced'),
  };

  const id = insertTicketType.run(values).lastInsertRowid;
  res.status(201).json({ ticketType: toAdminTicketType(getTicketTypeOr404(id)) });
}

// PATCH /api/admin/ticket-types/:id  — dowolny podzbiór pól z EDITABLE_FIELDS
// Zmiana ceny nie wpływa na kupione bilety (mają zapisaną cenę z chwili zakupu).
function updateTicketType(req, res) {
  const id = parseId(req.params.id);
  const body = req.body ?? {};
  getTicketTypeOr404(id);

  const assignments = [];
  const params = {};
  for (const [field, { column, validate }] of Object.entries(EDITABLE_FIELDS)) {
    if (body[field] !== undefined) {
      // Nazwy kolumn pochodzą ze stałej listy powyżej, wartości idą jako parametry
      assignments.push(`${column} = @${column}`);
      params[column] = validate(body[field]);
    }
  }

  if (assignments.length === 0) {
    throw new HttpError(400, `Podaj przynajmniej jedno pole do zmiany: ${Object.keys(EDITABLE_FIELDS).join(', ')}.`);
  }

  db.prepare(
    `UPDATE ticket_types SET ${assignments.join(', ')}, updated_at = datetime('now') WHERE id = @id`
  ).run({ ...params, id });

  res.json({ ticketType: toAdminTicketType(getTicketTypeOr404(id)) });
}

// PATCH /api/admin/ticket-types/:id/status  { isActive: true | false }
// Wycofanie zamiast usuwania: kupione bilety dalej wskazują na swój rodzaj.
function setTicketTypeStatus(req, res) {
  const id = parseId(req.params.id);
  const isActive = validateBoolean((req.body ?? {}).isActive, 'isActive');
  getTicketTypeOr404(id);

  updateTicketTypeStatus.run(isActive, id);
  res.json({ ticketType: toAdminTicketType(getTicketTypeOr404(id)) });
}

// ---------------------------------------------------------------------------
// Sprzedaż
// ---------------------------------------------------------------------------

// Te same kolumny i aliasy co w tickets.controller.js, żeby użyć tego samego toPublicTicket
const ADMIN_TICKETS_FROM_SQL = `
  FROM tickets t
  JOIN ticket_types tt ON tt.id = t.ticket_type_id
  JOIN users u ON u.id = t.user_id
  LEFT JOIN payments p ON p.ticket_id = t.id
  WHERE (@status IS NULL OR t.status = @status)
    AND (@userId IS NULL OR t.user_id = @userId)
`;
const listAdminTickets = db.prepare(`
  SELECT t.id, t.user_id, t.price_paid_grosze, t.status,
         t.purchased_at, t.activated_at, t.expires_at,
         tt.id AS type_id, tt.name AS type_name, tt.description AS type_description,
         tt.duration_minutes AS type_duration_minutes, tt.is_reduced AS type_is_reduced,
         u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
         p.method AS payment_method, p.status AS payment_status
  ${ADMIN_TICKETS_FROM_SQL}
  ORDER BY t.purchased_at DESC, t.id DESC
  LIMIT @limit OFFSET @offset
`);
const countAdminTickets = db.prepare(`SELECT COUNT(*) AS n ${ADMIN_TICKETS_FROM_SQL}`);

function parsePaging(query) {
  const limit = query.limit === undefined ? PAGE_SIZE_DEFAULT : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE_MAX) {
    throw new HttpError(400, `Parametr limit musi być liczbą od 1 do ${PAGE_SIZE_MAX}.`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, 'Parametr offset musi być liczbą nieujemną.');
  }
  return { limit, offset };
}

// GET /api/admin/tickets?status=active&userId=2&limit=50&offset=0
function listTickets(req, res) {
  const query = req.query ?? {};

  const status = query.status ?? null;
  if (status !== null && !TICKET_STATUSES.includes(status)) {
    throw new HttpError(400, `Parametr status musi mieć wartość: ${TICKET_STATUSES.join(', ')}.`);
  }
  const userId = query.userId === undefined ? null : parseId(query.userId);
  const { limit, offset } = parsePaging(query);

  const filters = { status, userId };
  const tickets = listAdminTickets.all({ ...filters, limit, offset }).map((row) => ({
    ...toPublicTicket(row),
    user: {
      id: row.user_id,
      email: row.user_email,
      firstName: row.user_first_name,
      lastName: row.user_last_name,
    },
    payment: row.payment_method ? { method: row.payment_method, status: row.payment_status } : null,
  }));

  res.json({ tickets, total: countAdminTickets.get(filters).n, limit, offset });
}

const statsTotals = db.prepare(`
  SELECT COUNT(*) AS tickets_sold,
         COALESCE(SUM(price_paid_grosze), 0) AS revenue_grosze,
         COALESCE(SUM(status = 'purchased'), 0) AS purchased,
         COALESCE(SUM(status = 'active'), 0) AS active,
         COALESCE(SUM(status = 'expired'), 0) AS expired
  FROM tickets
`);
const statsUsers = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'user'`);
const statsByType = db.prepare(`
  SELECT tt.id, tt.name, tt.is_reduced,
         COUNT(t.id) AS tickets_sold,
         COALESCE(SUM(t.price_paid_grosze), 0) AS revenue_grosze
  FROM ticket_types tt
  LEFT JOIN tickets t ON t.ticket_type_id = tt.id
  GROUP BY tt.id
  ORDER BY revenue_grosze DESC, tickets_sold DESC, tt.id
`);

// GET /api/admin/stats — podsumowanie sprzedaży do panelu administratora
function stats(req, res) {
  const totals = statsTotals.get();
  res.json({
    ticketsSold: totals.tickets_sold,
    revenueGrosze: totals.revenue_grosze,
    ticketsByStatus: { purchased: totals.purchased, active: totals.active, expired: totals.expired },
    registeredUsers: statsUsers.get().n,
    byTicketType: statsByType.all().map((row) => ({
      id: row.id,
      name: row.name,
      isReduced: row.is_reduced === 1,
      ticketsSold: row.tickets_sold,
      revenueGrosze: row.revenue_grosze,
    })),
  });
}

module.exports = {
  listTicketTypes,
  createTicketType,
  updateTicketType,
  setTicketTypeStatus,
  listTickets,
  stats,
};
