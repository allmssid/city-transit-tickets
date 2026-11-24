# Changelog

Lista tego, co zostało w projekcie **dodane, zmienione lub usunięte** – żeby każdy z zespołu
po `git pull` wiedział, co się zmieniło, bez czytania całego kodu.
Jak coś uruchomić albo jak działa – to opisuje `README.md`, nie ten plik.

## Jak pracować z tym plikiem

1. Każdy PR, który zmienia coś widocznego dla reszty zespołu (endpoint, tabela w bazie, skrypt npm,
   strona frontendu, zmienna w `.env`, zasada pracy), dopisuje wpis tutaj – w tym samym PR-ze co kod.
2. Wpis trafia do jednej z trzech sekcji:
    - **Dodane** – nowa funkcjonalność, plik, endpoint, tabela,
    - **Zmienione** – zmiana czegoś, co już było (inny kształt odpowiedzi, zmiana nazwy, inne zachowanie),
    - **Usunięte** – coś przestało istnieć lub działać.
3. Nowe wpisy dodajemy **na górze** danej sekcji. Jeden wpis = jedna linijka-dwie, konkretnie:
   co, gdzie (ścieżka pliku / endpoint) i w nawiasie czyja to gałąź, np. `(feature/tickets)`.
4. Jeśli zmiana łamie coś, czego używa druga osoba (np. zmienia format odpowiedzi API, z którego korzysta
   frontend), zaczynamy wpis od **UWAGA:** i piszemy, co trzeba poprawić po swojej stronie.
5. Nie wpisujemy drobiazgów bez wpływu na innych (literówki, formatowanie, refaktor bez zmiany zachowania).

---

## Dodane

- **Panel administratora – frontend** (`public/admin.html`, `public/css/admin.css`, `public/js/admin.js`),
  adres `http://localhost:3000/admin.html`. Wejście tylko dla roli `admin` (sprawdzane przez `GET /api/auth/me`;
  inni widzą komunikat). Zakładki: **Podsumowanie** (kafelki + sprzedaż wg rodzaju biletu), **Cennik**
  (tabela, dodawanie i edycja w oknie dialogowym – cena w zł, czas ważności w min / godz. / dni, wycofanie
  i przywracanie), **Sprzedaż** (wszystkie zakupy, filtr statusu, po 20 na stronę). Ten sam klucz tokena
  (`mpk_jwt_token`) co ekran logowania. Na razie własne style i funkcja `api()` – po scaleniu wspólnych
  `css/style.css` i `js/api.js` do przepięcia. **Kacper:** w nawigacji link „Panel admina” → `admin.html`
  tylko dla `role === 'admin'`. `(feature/admin)`

- **API panelu administratora** (`src/controllers/admin.controller.js`, `src/routes/admin.routes.js`, podpięte
  jako `/api/admin` w `src/routes/index.js`; wszystkie trasy `requireAuth` + `requireAdmin`, inaczej `401` / `403`):
    - `GET /api/admin/ticket-types` – wszystkie rodzaje biletów, także wycofane; pola publiczne + `isActive`,
      `ticketsSold`, `createdAt`, `updatedAt`,
    - `POST /api/admin/ticket-types` `{ name, priceGrosze, durationMinutes, description?, isReduced? }` → `201`,
    - `PATCH /api/admin/ticket-types/:id` – zmiana dowolnych z pól `name`, `description`, `priceGrosze`,
      `durationMinutes`, `isReduced`; kupione bilety zachowują cenę z chwili zakupu,
    - `PATCH /api/admin/ticket-types/:id/status` `{ isActive }` – wycofanie ze sprzedaży / przywrócenie (bez usuwania),
    - `GET /api/admin/tickets?status=&userId=&limit=&offset=` – wszystkie zakupy z danymi kupującego i płatności,
      `{ tickets, total, limit, offset }`; bilet w tym samym kształcie co `GET /api/tickets/me` + `user` i `payment`,
    - `GET /api/admin/stats` – liczba sprzedanych biletów, przychód w groszach, bilety wg statusu,
      liczba zarejestrowanych użytkowników, sprzedaż wg rodzaju biletu. `(feature/admin)`

- **Aktywacja biletu** `POST /api/tickets/:id/activate` (`requireAuth`): ustawia `activatedAt`, `expiresAt`
  (= aktywacja + `durationMinutes`) i status `active`, zwraca `200 { ticket }`. `404` dla cudzego lub
  nieistniejącego biletu, `409` gdy bilet jest już aktywny albo wygasł, `400` gdy `:id` nie jest liczbą. `(feature/activation)`
- **Wygasanie biletów**: `markExpired()` w `src/controllers/tickets.controller.js` zmienia `active` → `expired`
  po upływie `expiresAt`; wywoływane przed każdym odczytem biletów. Eksportowane, więc można go użyć też
  w panelu admina przed listą biletów. `(feature/activation)`
- **Filtr historii** `GET /api/tickets/me?status=purchased|active|expired`; inna wartość daje `400`. `(feature/activation)`
- `src/utils/dates.js` (`toIsoUtc`) i `src/utils/parseId.js` (walidacja `:id` z URL, przeniesiona z kontrolera typów biletów). `(feature/activation)`
- **Rodzaje biletów – API publiczne** (`src/controllers/ticketTypes.controller.js`,
  `src/routes/ticketTypes.routes.js`): `GET /api/ticket-types` (tylko aktywne) i `GET /api/ticket-types/:id`.
  Odpowiedzi w camelCase: `{ ticketTypes: [...] }` / `{ ticketType }`, pola `priceGrosze`, `durationMinutes`,
  `isReduced`. `400` gdy `:id` nie jest liczbą, `404` gdy typ nie istnieje lub jest nieaktywny. `(feature/tickets)`
- **Zakup i lista biletów** (`src/controllers/tickets.controller.js`, `src/routes/tickets.routes.js`, oba `requireAuth`):
    - `POST /api/tickets/purchase` `{ ticketTypeId, paymentMethod }` – bilet + płatność w jednej transakcji,
      zwraca `201` z `{ ticket, payment }`; `400` złe dane / typ wycofany, `404` typ nie istnieje,
    - `GET /api/tickets/me` – `{ tickets: [...] }`, najnowsze pierwsze, każdy bilet z zagnieżdżonym `ticketType`
      (nazwa, opis, `durationMinutes`, `isReduced`). `(feature/tickets)`
- Podpięcie `/ticket-types` i `/tickets` w `src/routes/index.js`; opis endpointów i przykładowe odpowiedzi w README. `(feature/tickets)`
- **Serwer Express 5** ze strukturą `routes/` → `controllers/` → `middleware/` → `db/`
  (`src/server.js`, `src/app.js`). CORS, parsowanie JSON, frontend z katalogu `public/`
  serwowany pod `http://localhost:3000`, API pod `/api`.
- **Konfiguracja z `.env`** (`src/config.js`): `PORT`, `DB_PATH`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
  `CORS_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Wzór w `.env.example`; ostrzeżenie w konsoli,
  gdy brakuje `JWT_SECRET`.
- **Schemat bazy SQLite** (`src/db/schema.sql`, better-sqlite3):
    - `users` – konta z rolą `user` / `admin`, hasła jako hash bcrypt,
    - `ticket_types` – rodzaje biletów (nazwa, opis, cena w groszach, czas ważności w minutach,
      flaga ulgowy, flaga aktywny),
    - `tickets` – kupione bilety ze statusem `purchased` → `active` → `expired`, ceną z chwili zakupu
      oraz datami zakupu, aktywacji i wygaśnięcia,
    - `payments` – symulowane płatności (`blik` / `card` / `transfer`, status `pending` / `completed` / `failed`),
    - indeksy na `tickets.user_id`, `tickets.status`, `payments.ticket_id`; włączone klucze obce.
- **Skrypty bazy** (`npm run db:init`, `db:seed`, `db:reset`): tworzenie tabel, usuwanie bazy,
  dane startowe – 9 rodzajów biletów (20 min, 60 min, 24 h, 7 dni, 30 dni, normalne i ulgowe)
  oraz dwa konta testowe (`admin@mpk.local` / `Admin123!`, `jan.kowalski@mpk.local` / `Haslo123!`).
  Seed można uruchamiać wielokrotnie bez dublowania danych.
- **Rejestracja i logowanie na JWT** (`src/controllers/auth.controller.js`, `src/routes/auth.routes.js`):
    - `POST /api/auth/register` – walidacja e-maila i hasła (min. 8 znaków), normalizacja e-maila,
      `409` gdy adres zajęty,
    - `POST /api/auth/login` – ten sam komunikat błędu dla złego e-maila i złego hasła,
    - `GET /api/auth/me` – dane zalogowanego użytkownika,
    - token JWT z `sub` = id użytkownika i `role`, ważny domyślnie 2 h.
- **Middleware** (`src/middleware/`): `requireAuth` (sprawdza `Authorization: Bearer <token>`,
  ustawia `req.user`), `requireAdmin` (tylko rola `admin`), `notFound` dla nieznanych tras `/api/*`
  oraz `errorHandler` zwracający każdy błąd jako `{ "error": "komunikat" }`.
- **`HttpError`** (`src/utils/HttpError.js`) – błąd z kodem HTTP do rzucania w kontrolerach:
  `throw new HttpError(404, 'komunikat')`.
- **`GET /api/health`** – sprawdzenie działania serwera.
- **Placeholder frontendu** `public/index.html`.
- **README** z instrukcją uruchomienia, strukturą projektu, tabelą endpointów i przykładem `fetch`.
- **`CHANGELOG.md`** – ten plik.
- **Zasada pracy:** każdy na własnej gałęzi (`feature/tickets`, `feature/frontend`), zmiany do `main`
  tylko przez pull request.

## Zmienione

- Panel admina: `GET /api/admin/tickets` i `GET /api/admin/stats` wywołują `markExpired()`, więc liczniki statusów
  są aktualne; `createdAt` / `updatedAt` rodzajów biletów też w ISO z `Z`; `parseId` importowany z `src/utils/parseId.js`. `(feature/activation)`
- **UWAGA:** daty biletów i płatności (`purchasedAt`, `activatedAt`, `expiresAt`, `createdAt` w `payment`) są teraz
  w ISO 8601 z `Z`, np. `2026-11-23T12:00:00Z` zamiast `2026-11-23 12:00:00`. Na froncie parsować przez
  `new Date(...)`; stary format byłby odczytany jako czas lokalny i licznik byłby przesunięty o godzinę. `(feature/activation)`

## Usunięte

_(na razie nic)_
