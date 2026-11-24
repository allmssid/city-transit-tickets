// Panel administratora — korzysta z /api/admin/* (tylko rola admin).
// Uwaga: sprawdzenie roli na froncie to tylko wygoda; dostęp naprawdę blokuje API (requireAdmin).
// Po scaleniu wspólnego js/api.js od Kacpra funkcję api() poniżej można zastąpić wspólną.

// Ten sam adres API i klucz tokena co na ekranie logowania (index.html)
const API_BASE = window.location.port === '3000' ? '/api' : 'http://localhost:3000/api';
const TOKEN_KEY = 'mpk_jwt_token';
const SALES_PAGE_SIZE = 20;

const STATUS_LABELS = { purchased: 'Kupiony', active: 'Aktywny', expired: 'Wygasły' };
const STATUS_BADGES = { purchased: '', active: 'green', expired: 'gray' };
const PAYMENT_LABELS = { blik: 'BLIK', card: 'Karta', transfer: 'Przelew' };

const state = {
  ticketTypes: [],   // ostatnio pobrany cennik (do edycji)
  editingId: null,   // id edytowanego rodzaju biletu, null = nowy
  salesOffset: 0,
  salesTotal: 0,
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Komunikacja z API
// ---------------------------------------------------------------------------

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Nie udało się połączyć z serwerem API (sprawdź, czy działa npm run dev).');
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    // Token wygasł lub jest nieprawidłowy — wracamy do logowania
    localStorage.removeItem(TOKEN_KEY);
    showAccessMessage('Sesja wygasła. Zaloguj się ponownie na konto administratora.', true);
    throw new Error(data.error || 'Sesja wygasła.');
  }
  if (!res.ok) {
    throw new Error(data.error || `Błąd serwera (${res.status}).`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Pomocnicze: tworzenie elementów (tekst zawsze przez textContent — bez XSS) i formatowanie
// ---------------------------------------------------------------------------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'number' ? String(child) : child);
  }
  return node;
}

const moneyFormat = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const formatMoney = (grosze) => moneyFormat.format(grosze / 100);

function formatDuration(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 dzień' : `${days} dni`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} godz.`;
  return `${minutes} min`;
}

// API zwraca czas UTC jako "2026-11-24 08:54:59" (SQLite) albo ISO z "Z" — obsługujemy oba formaty
function parseApiDate(value) {
  if (!value) return null;
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseApiDate(value);
  return date
    ? date.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

function badge(text, color = '') {
  return el('span', { className: `badge ${color}`.trim() }, text);
}

function emptyRow(colspan, text) {
  return el('tr', {}, el('td', { colspan, className: 'empty' }, text));
}

// ---------------------------------------------------------------------------
// Komunikaty
// ---------------------------------------------------------------------------

let alertTimer;
function showAlert(message, type = 'error') {
  const box = $('alertBox');
  box.textContent = message;
  box.className = `alert ${type}`;
  clearTimeout(alertTimer);
  if (type === 'success') alertTimer = setTimeout(clearAlert, 4000);
}

function clearAlert() {
  $('alertBox').className = 'alert';
  $('alertBox').textContent = '';
}

function showAccessMessage(message, withLoginLink = false) {
  $('adminApp').classList.add('hidden');
  const box = $('accessMessage');
  box.replaceChildren(
    el('p', {}, message),
    withLoginLink ? el('p', {}, el('a', { href: 'index.html' }, 'Przejdź do logowania')) : null,
  );
  box.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Zakładki
// ---------------------------------------------------------------------------

const TAB_LOADERS = {
  stats: loadStats,
  'ticket-types': loadTicketTypes,
  sales: loadSales,
};

function showTab(name) {
  clearAlert();
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== `tab-${name}`;
  });
  // Dane pobierane przy każdym wejściu w zakładkę — zawsze aktualne
  TAB_LOADERS[name]().catch((err) => showAlert(err.message));
}

// ---------------------------------------------------------------------------
// Podsumowanie — GET /api/admin/stats
// ---------------------------------------------------------------------------

async function loadStats() {
  const stats = await api('/admin/stats');

  const tiles = [
    ['Sprzedane bilety', stats.ticketsSold],
    ['Przychód', formatMoney(stats.revenueGrosze)],
    ['Aktywne teraz', stats.ticketsByStatus.active],
    ['Zarejestrowani użytkownicy', stats.registeredUsers],
  ];
  $('statTiles').replaceChildren(
    ...tiles.map(([label, value]) =>
      el('div', { className: 'card tile' }, el('div', { className: 'tile-label' }, label), el('div', { className: 'tile-value' }, value)),
    ),
  );

  const maxRevenue = Math.max(0, ...stats.byTicketType.map((t) => t.revenueGrosze));
  const rows = stats.byTicketType.map((t) =>
    el('tr', {},
      el('td', {}, t.name, t.isReduced ? ' ' : null, t.isReduced ? badge('ulgowy', 'amber') : null),
      el('td', { className: 'num' }, t.ticketsSold),
      el('td', { className: 'num' }, formatMoney(t.revenueGrosze)),
      el('td', { className: 'bar-col' },
        el('div', { className: 'bar' }, el('span', { style: `width: ${maxRevenue ? (t.revenueGrosze / maxRevenue) * 100 : 0}%` }))),
    ),
  );
  $('statsByTypeBody').replaceChildren(...(rows.length ? rows : [emptyRow(4, 'Brak rodzajów biletów.')]));
}

// ---------------------------------------------------------------------------
// Cennik — GET/POST/PATCH /api/admin/ticket-types
// ---------------------------------------------------------------------------

async function loadTicketTypes() {
  const { ticketTypes } = await api('/admin/ticket-types');
  state.ticketTypes = ticketTypes;

  const rows = ticketTypes.map((t) =>
    el('tr', { className: t.isActive ? null : 'inactive' },
      el('td', {},
        el('div', {}, t.name, t.isReduced ? ' ' : null, t.isReduced ? badge('ulgowy', 'amber') : null),
        t.description ? el('div', { className: 'muted small' }, t.description) : null),
      el('td', {}, formatDuration(t.durationMinutes)),
      el('td', { className: 'num' }, formatMoney(t.priceGrosze)),
      el('td', { className: 'num' }, t.ticketsSold),
      el('td', {}, t.isActive ? badge('W sprzedaży', 'green') : badge('Wycofany', 'gray')),
      el('td', { className: 'actions' },
        el('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => openTicketTypeDialog(t) }, 'Edytuj'),
        t.isActive
          ? el('button', { type: 'button', className: 'btn btn-danger btn-sm', onClick: () => setTicketTypeActive(t, false) }, 'Wycofaj')
          : el('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => setTicketTypeActive(t, true) }, 'Przywróć')),
    ),
  );
  $('ticketTypesBody').replaceChildren(...(rows.length ? rows : [emptyRow(6, 'Brak rodzajów biletów.')]));
}

async function setTicketTypeActive(ticketType, isActive) {
  if (!isActive && !confirm(`Wycofać „${ticketType.name}” ze sprzedaży? Kupione bilety pozostaną ważne.`)) {
    return;
  }
  try {
    await api(`/admin/ticket-types/${ticketType.id}/status`, { method: 'PATCH', body: { isActive } });
    showAlert(isActive ? `„${ticketType.name}” wrócił do sprzedaży.` : `„${ticketType.name}” wycofano ze sprzedaży.`, 'success');
    await loadTicketTypes();
  } catch (err) {
    showAlert(err.message);
  }
}

// Czas ważności w formularzu: największa jednostka, która dzieli się bez reszty
function splitDuration(minutes) {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 1440 };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: 60 };
  return { value: minutes, unit: 1 };
}

// "4,80" / "4.8" / "12" -> grosze (liczba całkowita); null gdy format niepoprawny
function parsePriceToGrosze(text) {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function showFormError(message) {
  $('formError').textContent = message;
  $('formError').className = message ? 'alert error' : 'alert';
}

function openTicketTypeDialog(ticketType = null) {
  state.editingId = ticketType ? ticketType.id : null;
  $('dialogTitle').textContent = ticketType ? `Edycja: ${ticketType.name}` : 'Nowy rodzaj biletu';
  showFormError('');

  const duration = ticketType ? splitDuration(ticketType.durationMinutes) : { value: '', unit: 1 };
  $('ttName').value = ticketType ? ticketType.name : '';
  $('ttDescription').value = ticketType?.description ?? '';
  $('ttPrice').value = ticketType ? (ticketType.priceGrosze / 100).toFixed(2).replace('.', ',') : '';
  $('ttDuration').value = duration.value;
  $('ttDurationUnit').value = String(duration.unit);
  $('ttReduced').checked = ticketType ? ticketType.isReduced : false;

  $('ticketTypeDialog').showModal();
  $('ttName').focus();
}

async function saveTicketType(event) {
  event.preventDefault();
  showFormError('');

  const name = $('ttName').value.trim();
  const priceGrosze = parsePriceToGrosze($('ttPrice').value);
  const durationValue = Number($('ttDuration').value);
  const durationMinutes = durationValue * Number($('ttDurationUnit').value);

  // Walidacja po stronie przeglądarki — dla wygody; API sprawdza to samo
  if (!name) return showFormError('Podaj nazwę biletu.');
  if (priceGrosze === null) return showFormError('Podaj cenę w złotych, np. 4,80.');
  if (!Number.isInteger(durationValue) || durationValue <= 0) return showFormError('Czas ważności musi być dodatnią liczbą całkowitą.');

  const body = {
    name,
    description: $('ttDescription').value.trim() || null,
    priceGrosze,
    durationMinutes,
    isReduced: $('ttReduced').checked,
  };

  const button = $('saveTicketTypeBtn');
  button.disabled = true;
  try {
    if (state.editingId === null) {
      await api('/admin/ticket-types', { method: 'POST', body });
      showAlert(`Dodano „${name}”.`, 'success');
    } else {
      await api(`/admin/ticket-types/${state.editingId}`, { method: 'PATCH', body });
      showAlert(`Zapisano zmiany w „${name}”.`, 'success');
    }
    $('ticketTypeDialog').close();
    await loadTicketTypes();
  } catch (err) {
    showFormError(err.message);
  } finally {
    button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Sprzedaż — GET /api/admin/tickets
// ---------------------------------------------------------------------------

async function loadSales() {
  const params = new URLSearchParams({ limit: SALES_PAGE_SIZE, offset: state.salesOffset });
  const status = $('salesStatusFilter').value;
  if (status) params.set('status', status);

  const { tickets, total } = await api(`/admin/tickets?${params}`);
  state.salesTotal = total;

  const rows = tickets.map((t) => {
    const fullName = [t.user.firstName, t.user.lastName].filter(Boolean).join(' ');
    return el('tr', {},
      el('td', {}, formatDate(t.purchasedAt)),
      el('td', {}, el('div', {}, t.user.email), fullName ? el('div', { className: 'muted small' }, fullName) : null),
      el('td', {}, t.ticketType.name),
      el('td', { className: 'num' }, formatMoney(t.pricePaidGrosze)),
      el('td', {}, t.payment ? PAYMENT_LABELS[t.payment.method] ?? t.payment.method : '—'),
      el('td', {}, badge(STATUS_LABELS[t.status] ?? t.status, STATUS_BADGES[t.status])),
      el('td', {}, formatDate(t.expiresAt)),
    );
  });
  $('salesBody').replaceChildren(...(rows.length ? rows : [emptyRow(7, 'Brak biletów dla wybranego filtra.')]));

  const from = total === 0 ? 0 : state.salesOffset + 1;
  const to = Math.min(state.salesOffset + SALES_PAGE_SIZE, total);
  $('pageInfo').textContent = `${from}–${to} z ${total}`;
  $('prevPageBtn').disabled = state.salesOffset === 0;
  $('nextPageBtn').disabled = state.salesOffset + SALES_PAGE_SIZE >= total;
}

function changeSalesPage(direction) {
  state.salesOffset = Math.max(0, state.salesOffset + direction * SALES_PAGE_SIZE);
  loadSales().catch((err) => showAlert(err.message));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function init() {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  $('addTicketTypeBtn').addEventListener('click', () => openTicketTypeDialog());
  $('ticketTypeForm').addEventListener('submit', saveTicketType);
  $('cancelDialogBtn').addEventListener('click', () => $('ticketTypeDialog').close());
  $('salesStatusFilter').addEventListener('change', () => {
    state.salesOffset = 0;
    loadSales().catch((err) => showAlert(err.message));
  });
  $('prevPageBtn').addEventListener('click', () => changeSalesPage(-1));
  $('nextPageBtn').addEventListener('click', () => changeSalesPage(1));
  $('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = 'index.html';
  });

  if (!localStorage.getItem(TOKEN_KEY)) {
    showAccessMessage('Panel administratora wymaga zalogowania.', true);
    return;
  }

  try {
    const { user } = await api('/auth/me');
    if (user.role !== 'admin') {
      showAccessMessage('Ta strona jest dostępna tylko dla administratora.', true);
      return;
    }
    $('adminEmail').textContent = user.email;
    $('accessMessage').classList.add('hidden');
    $('adminApp').classList.remove('hidden');
    showTab('stats');
  } catch (err) {
    showAccessMessage(err.message, true);
  }
}

init();
