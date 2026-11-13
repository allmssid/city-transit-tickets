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

| Skrypt | Co robi |
|---|---|
| `npm start` | uruchamia serwer |
| `npm run dev` | uruchamia serwer i restartuje go po każdej zmianie w kodzie |
| `npm run db:init` | tworzy brakujące tabele (dane zostają) |
| `npm run db:seed` | dodaje dane startowe (można uruchamiać wielokrotnie) |
| `npm run db:reset` | usuwa bazę i tworzy ją od nowa z danymi startowymi |

### Konta testowe (po `db:seed`)

| Rola | E-mail | Hasło |
|---|---|---|
| admin | `admin@mpk.local` | `Admin123!` (z `.env`) |
| user | `jan.kowalski@mpk.local` | `Haslo123!` |

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
- Daty w UTC, w formacie `YYYY-MM-DD HH:MM:SS`.
- Status biletu: `purchased` (kupiony) → `active` (aktywowany) → `expired` (wygasły).
- `tickets.price_paid_grosze` zapisuje cenę z chwili zakupu, żeby późniejsza zmiana cennika nie zmieniała historii.

## API

Wszystkie odpowiedzi są w JSON. Błędy mają format `{ "error": "komunikat" }`.

Endpointy wymagające logowania przyjmują nagłówek `Authorization: Bearer <token>`.

| Metoda | Endpoint | Dostęp | Opis |
|---|---|---|---|
| GET | `/api/health` | publiczny | sprawdzenie działania serwera |
| POST | `/api/auth/register` | publiczny | rejestracja: `{ email, password, firstName?, lastName? }` |
| POST | `/api/auth/login` | publiczny | logowanie: `{ email, password }` |
| GET | `/api/auth/me` | zalogowany | dane zalogowanego użytkownika |

Rejestracja i logowanie zwracają:

```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "email": "jan.kowalski@mpk.local", "firstName": "Jan", "lastName": "Kowalski", "role": "user", "createdAt": "2026-11-13 20:15:00" }
}
```

Kody błędów: `400` niepoprawne dane, `401` brak lub zły token albo złe hasło, `403` brak uprawnień admina, `409` e-mail zajęty.

### Przykład z frontendu

```js
const res = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error);
localStorage.setItem('token', data.token);

// kolejne zapytania:
fetch('http://localhost:3000/api/auth/me', {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
});
```

### Ochrona tras

```js
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/me', requireAuth, handler);                       // zalogowany użytkownik (req.user)
router.post('/ticket-types', requireAuth, requireAdmin, handler); // tylko admin
```
