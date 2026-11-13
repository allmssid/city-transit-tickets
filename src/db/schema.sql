-- Schemat bazy: System sprzedaży biletów komunikacji miejskiej
-- Ceny przechowywane są w groszach (INTEGER), np. 3,40 zł = 340 — bez błędów zaokrągleń.
-- Daty w formacie ISO 8601 UTC, np. '2026-11-13 20:15:00'.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Rodzaje biletów zarządzane przez administratora
CREATE TABLE IF NOT EXISTS ticket_types (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  description      TEXT,
  price_grosze     INTEGER NOT NULL CHECK (price_grosze >= 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  is_reduced       INTEGER NOT NULL DEFAULT 0 CHECK (is_reduced IN (0, 1)), -- 1 = ulgowy
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),  -- 0 = wycofany ze sprzedaży
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Bilety kupione przez użytkowników
-- Cykl życia: purchased (kupiony) -> active (aktywowany) -> expired (wygasły)
CREATE TABLE IF NOT EXISTS tickets (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_type_id     INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
  price_paid_grosze  INTEGER NOT NULL CHECK (price_paid_grosze >= 0), -- cena z chwili zakupu
  status             TEXT    NOT NULL DEFAULT 'purchased'
                     CHECK (status IN ('purchased', 'active', 'expired')),
  purchased_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  activated_at       TEXT,
  expires_at         TEXT
);

-- Symulowane płatności (bez integracji z prawdziwym operatorem)
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  amount_grosze INTEGER NOT NULL CHECK (amount_grosze >= 0),
  method        TEXT    NOT NULL CHECK (method IN ('blik', 'card', 'transfer')),
  status        TEXT    NOT NULL DEFAULT 'completed'
                CHECK (status IN ('pending', 'completed', 'failed')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id   ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status    ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_payments_ticket_id ON payments(ticket_id);
