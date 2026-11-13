// npm run db:seed — dane startowe. Można uruchamiać wielokrotnie:
// konta nie dublują się, a typy biletów dodawane są tylko do pustej tabeli.
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('./connection');
const { initSchema } = require('./schema');

// Ceny w groszach — przykładowe, na potrzeby symulacji
const TICKET_TYPES = [
  { name: 'Bilet 20-minutowy', description: 'Jednorazowy przejazd do 20 minut', price: 340, minutes: 20, reduced: 0 },
  { name: 'Bilet 20-minutowy ulgowy', description: 'Jednorazowy przejazd do 20 minut', price: 170, minutes: 20, reduced: 1 },
  { name: 'Bilet 60-minutowy', description: 'Dowolna liczba przesiadek przez 60 minut', price: 480, minutes: 60, reduced: 0 },
  { name: 'Bilet 60-minutowy ulgowy', description: 'Dowolna liczba przesiadek przez 60 minut', price: 240, minutes: 60, reduced: 1 },
  { name: 'Bilet 24-godzinny', description: 'Nieograniczone przejazdy przez 24 godziny', price: 1400, minutes: 1440, reduced: 0 },
  { name: 'Bilet 24-godzinny ulgowy', description: 'Nieograniczone przejazdy przez 24 godziny', price: 700, minutes: 1440, reduced: 1 },
  { name: 'Bilet 7-dniowy', description: 'Nieograniczone przejazdy przez 7 dni', price: 4400, minutes: 7 * 1440, reduced: 0 },
  { name: 'Bilet 30-dniowy', description: 'Nieograniczone przejazdy przez 30 dni', price: 11000, minutes: 30 * 1440, reduced: 0 },
  { name: 'Bilet 30-dniowy ulgowy', description: 'Nieograniczone przejazdy przez 30 dni', price: 5500, minutes: 30 * 1440, reduced: 1 },
];

const USERS = [
  { email: config.admin.email, password: config.admin.password, firstName: 'Admin', lastName: 'Systemu', role: 'admin' },
  { email: 'jan.kowalski@mpk.local', password: 'Haslo123!', firstName: 'Jan', lastName: 'Kowalski', role: 'user' },
];

initSchema(db);

const insertTicketType = db.prepare(`
  INSERT INTO ticket_types (name, description, price_grosze, duration_minutes, is_reduced)
  VALUES (@name, @description, @price, @minutes, @reduced)
`);
const insertUser = db.prepare(`
  INSERT INTO users (email, password_hash, first_name, last_name, role)
  SELECT @email, @passwordHash, @firstName, @lastName, @role
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = @email)
`);

const usersWithHashes = USERS.map((user) => ({
  ...user,
  passwordHash: bcrypt.hashSync(user.password, 10),
}));

const seed = db.transaction(() => {
  let ticketTypesAdded = 0;
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM ticket_types').get();
  if (n === 0) {
    for (const ticketType of TICKET_TYPES) {
      insertTicketType.run(ticketType);
      ticketTypesAdded++;
    }
  }

  let usersAdded = 0;
  for (const user of usersWithHashes) {
    const { firstName, lastName, email, passwordHash, role } = user;
    usersAdded += insertUser.run({ firstName, lastName, email, passwordHash, role }).changes;
  }

  return { ticketTypesAdded, usersAdded };
});

const { ticketTypesAdded, usersAdded } = seed();
db.close();

console.log(`Dodano typów biletów: ${ticketTypesAdded}${ticketTypesAdded ? '' : ' (tabela nie była pusta)'}`);
console.log(`Dodano użytkowników: ${usersAdded}`);
console.log('Konta testowe:');
for (const user of USERS) {
  console.log(`  [${user.role}] ${user.email} / ${user.password}`);
}
