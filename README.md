# city-transit-tickets

System sprzedaży biletów komunikacji miejskiej — projekt z przedmiotu **Aplikacje wielowarstwowe**.

Architektura trójwarstwowa: frontend (HTML/CSS/JS) → REST API (Node.js + Express) → baza SQLite.

## Uruchomienie

Wymagany Node.js 20 lub nowszy.

```bash
npm install
cp .env.example .env      #
npm run db:reset          # tworzy bazę od zera i wgrywa dane startowe
npm run dev               # serwer z automatycznym restartem po zmianach
```

Serwer: <http://localhost:3000>, sprawdzenie działania: <http://localhost:3000/api/health>.

| Skrypt             | Co robi                                                     |
| ------------------ | ----------------------------------------------------------- |
| `npm start`        | uruchamia serwer                                            |
| `npm run dev`      | uruchamia serwer i restartuje go po każdej zmianie w kodzie |
| `npm run db:init`  | tworzy brakujące tabele (dane zostają)                      |
| `npm run db:seed`  | dodaje dane startowe (można uruchamiać wielokrotnie)        |
| `npm run db:reset` | usuwa bazę i tworzy ją od nowa z danymi startowymi          |

### Konta testowe (po `db:seed`)

| Rola  | E-mail                   | Hasło                  |
| ----- | ------------------------ | ---------------------- |
| admin | `admin@mpk.local`        | `Admin123!` (z `.env`) |
| user  | `jan.kowalski@mpk.local` | `Haslo123!`            |

## Struktura projektu

```
src/
  server.js           start serwera
  app.js              konfiguracja Express (CORS, JSON, statyczny frontend, trasy)
  config.js           ustawienia z pliku .env
  routes/             definicje endpointów (URL → kontroler)
  controllers/        logika obsługi zapytań
  middleware/         requireAuth / requireAdmin, obsługa błędów
  db/
    schema.sql        tabele: users, ticket_types, tickets, payments
    connection.js     połączenie z SQLite (better-sqlite3)
    init.js, seed.js  tworzenie bazy i dane startowe
  utils/HttpError.js  błąd z kodem HTTP
public/               frontend (serwowany pod http://localhost:3000)
data/                 plik bazy (nie trafia do repo)
```

Nowy moduł dodajemy tak: kontroler w `controllers/`, router w `routes/`, podpięcie w `routes/index.js`.

## Baza danych

- **Ceny w groszach** (`INTEGER`): 3,40 zł zapisujemy jako `340`. Na froncie dzielimy przez 100.
- Daty w bazie w UTC, w formacie `YYYY-MM-DD HH:MM:SS`. API zwraca je w ISO 8601 z `Z` (`2026-11-23T12:00:00Z`), więc na froncie wystarczy `new Date(expiresAt)`.
- Status biletu: `purchased` (kupiony) → `active` (aktywowany) → `expired` (wygasły).
- `tickets.price_paid_grosze` zapisuje cenę z chwili zakupu, żeby późniejsza zmiana cennika nie zmieniała historii.

## API

Wszystkie odpowiedzi są w JSON. Błędy mają format `{ "error": "komunikat" }`.

Endpointy wymagające logowania przyjmują nagłówek `Authorization: Bearer <token>`.

| Metoda | Endpoint                             | Dostęp     | Opis                                                                                                       |
| ------ | ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                        | publiczny  | sprawdzenie działania serwera                                                                              |
| POST   | `/api/auth/register`                 | publiczny  | rejestracja: `{ email, password, firstName?, lastName? }`                                                  |
| POST   | `/api/auth/login`                    | publiczny  | logowanie: `{ email, password }`                                                                           |
| GET    | `/api/auth/me`                       | zalogowany | dane zalogowanego użytkownika                                                                              |
| GET    | `/api/ticket-types`                  | publiczny  | lista rodzajów biletów dostępnych w sprzedaży (`is_active = 1`)                                            |
| GET    | `/api/ticket-types/:id`              | publiczny  | jeden rodzaj biletu; `404` gdy nie istnieje lub jest wycofany                                              |
| POST   | `/api/tickets/purchase`              | zalogowany | zakup biletu: `{ ticketTypeId, paymentMethod: "blik" \| "card" \| "transfer" }` → `201`                    |
| GET    | `/api/tickets/me`                    | zalogowany | bilety zalogowanego użytkownika, najnowsze pierwsze                                                        |
| GET    | `/api/admin/ticket-types`            | admin      | wszystkie rodzaje biletów, także wycofane, z liczbą sprzedanych                                            |
| POST   | `/api/admin/ticket-types`            | admin      | nowy rodzaj biletu → `201`                                                                                 |
| PATCH  | `/api/admin/ticket-types/:id`        | admin      | zmiana nazwy, opisu, ceny, czasu ważności, ulgi                                                            |
| PATCH  | `/api/admin/ticket-types/:id/status` | admin      | wycofanie ze sprzedaży / przywrócenie: `{ isActive }`                                                      |
| GET    | `/api/admin/tickets`                 | admin      | wszystkie zakupy: `?status=`, `?userId=`, `?limit=` (1–200, domyślnie 50), `?offset=`                      |
| GET    | `/api/admin/stats`                   | admin      | podsumowanie sprzedaży                                                                                     |
| GET    | `/api/tickets/me`                    | zalogowany | bilety zalogowanego użytkownika, najnowsze pierwsze; opcjonalny filtr `?status=purchased\|active\|expired` |
| POST   | `/api/tickets/:id/activate`          | zalogowany | aktywacja własnego biletu o statusie `purchased` → `200`                                                   |

Rejestracja i logowanie zwracają:

```json
{
    "token": "eyJhbGciOi...",
    "user": {
        "id": 1,
        "email": "jan.kowalski@mpk.local",
        "firstName": "Jan",
        "lastName": "Kowalski",
        "role": "user",
        "createdAt": "2026-11-13 20:15:00"
    }
}
```

Kody błędów: `400` niepoprawne dane, `401` brak lub zły token albo złe hasło, `403` brak uprawnień admina, `409` e-mail zajęty.

### Rodzaje biletów i bilety

`GET /api/ticket-types` zwraca `{ "ticketTypes": [...] }`, a `GET /api/ticket-types/:id` – `{ "ticketType": {...} }`:

```json
{
    "id": 1,
    "name": "Bilet 20-minutowy",
    "description": "Jednorazowy przejazd do 20 minut",
    "priceGrosze": 340,
    "durationMinutes": 20,
    "isReduced": false
}
```

`POST /api/tickets/purchase` w jednej transakcji zapisuje bilet (status `purchased`, cena z chwili zakupu)
i symulowaną płatność (status `completed`). Zwraca `201`:

```json
{
    "ticket": {
        "id": 1,
        "status": "purchased",
        "pricePaidGrosze": 340,
        "purchasedAt": "2026-11-16T12:37:40Z",
        "activatedAt": null,
        "expiresAt": null,
        "ticketType": {
            "id": 1,
            "name": "Bilet 20-minutowy",
            "description": "Jednorazowy przejazd do 20 minut",
            "durationMinutes": 20,
            "isReduced": false
        }
    },
    "payment": {
        "id": 1,
        "method": "blik",
        "status": "completed",
        "amountGrosze": 340,
        "createdAt": "2026-11-16T12:37:40Z"
    }
}
```

`GET /api/tickets/me` zwraca `{ "tickets": [...] }` – każdy bilet w tym samym kształcie co `ticket` powyżej.
Parametr `?status=purchased|active|expired` zawęża listę (np. zakładki historii); inna wartość daje `400`.

`POST /api/tickets/:id/activate` ustawia `activatedAt` na teraz, `expiresAt` na teraz + `durationMinutes`
i status `active`. Zwraca `200` z `{ "ticket": {...} }`:

```json
{
    "ticket": {
        "id": 1,
        "status": "active",
        "pricePaidGrosze": 340,
        "purchasedAt": "2026-11-24T10:31:32Z",
        "activatedAt": "2026-11-24T10:31:32Z",
        "expiresAt": "2026-11-24T10:51:32Z",
        "ticketType": {
            "id": 1,
            "name": "Bilet 20-minutowy",
            "description": "Jednorazowy przejazd do 20 minut",
            "durationMinutes": 20,
            "isReduced": false
        }
    }
}
```

Błędy aktywacji: `400` zły `:id`, `404` bilet nie istnieje lub należy do kogoś innego, `409` bilet jest już aktywny albo wygasł.

Wygasanie: przed każdym odczytem biletów (`GET /api/tickets/me`, aktywacja) bilety `active` z minionym `expiresAt`
zmieniają status na `expired` (`markExpired()` w `tickets.controller.js`). Licznik pozostałego czasu frontend liczy sam
z `expiresAt`.

Błędy zakupu: `400` zły `ticketTypeId` lub `paymentMethod`, `400` rodzaj biletu wycofany ze sprzedaży, `404` rodzaj biletu nie istnieje.

### Panel administratora

Wszystkie trasy `/api/admin/*` wymagają tokena konta z rolą `admin` (inaczej `401` / `403`).

Rodzaj biletu w widoku admina ma pola publiczne oraz dodatkowo:

```json
{
    "id": 1,
    "name": "Bilet 20-minutowy",
    "description": "Jednorazowy przejazd do 20 minut",
    "priceGrosze": 340,
    "durationMinutes": 20,
    "isReduced": false,
    "isActive": true,
    "ticketsSold": 12,
    "createdAt": "2026-11-13 20:15:00",
    "updatedAt": "2026-11-24 09:00:00"
}
```

- `POST /api/admin/ticket-types` – wymagane `name`, `priceGrosze` (liczba całkowita 0–100000), `durationMinutes` (1–525600);
  opcjonalne `description`, `isReduced` (domyślnie `false`). Nowy rodzaj od razu jest w sprzedaży.
- `PATCH /api/admin/ticket-types/:id` – wysyłamy tylko zmieniane pola, np. `{ "priceGrosze": 360 }`.
  Zmiana ceny nie zmienia ceny już kupionych biletów.
- `PATCH /api/admin/ticket-types/:id/status` – `{ "isActive": false }` wycofuje rodzaj ze sprzedaży
  (znika z `GET /api/ticket-types`, zakup zwraca `400`); rodzajów nie usuwamy, bo wskazują na nie kupione bilety.
- `GET /api/admin/tickets` zwraca `{ "tickets": [...], "total": 42, "limit": 50, "offset": 0 }`; każdy bilet jak w
  `GET /api/tickets/me`, plus `"user": { "id", "email", "firstName", "lastName" }` i `"payment": { "method", "status" }`.
- `GET /api/admin/stats`:

```json
{
    "ticketsSold": 3,
    "revenueGrosze": 2120,
    "ticketsByStatus": { "purchased": 3, "active": 0, "expired": 0 },
    "registeredUsers": 1,
    "byTicketType": [
        {
            "id": 5,
            "name": "Bilet 24-godzinny",
            "isReduced": false,
            "ticketsSold": 1,
            "revenueGrosze": 1400
        }
    ]
}
```

Błędy: `400` niepoprawne dane lub parametry, `404` rodzaj biletu nie istnieje.

### Przykład z frontendu

```js
const res = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error);
localStorage.setItem("token", data.token);

// kolejne zapytania:
fetch("http://localhost:3000/api/auth/me", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});
```

### Ochrona tras

```js
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.get("/me", requireAuth, handler); // zalogowany użytkownik (req.user)
router.post("/ticket-types", requireAuth, requireAdmin, handler); // tylko admin
```
