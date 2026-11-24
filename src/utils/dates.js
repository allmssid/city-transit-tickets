// SQLite zapisuje czas UTC jako 'YYYY-MM-DD HH:MM:SS', bez strefy czasowej.
// new Date('2026-11-23 12:00:00') w przeglądarce odczytałby to jako czas lokalny
// i licznik ważności byłby przesunięty o godzinę. Dlatego API zwraca ISO 8601 z 'Z':
// '2026-11-23 12:00:00' -> '2026-11-23T12:00:00Z'
function toIsoUtc(value) {
  if (value == null) return null;
  return `${value.replace(' ', 'T')}Z`;
}

module.exports = { toIsoUtc };
