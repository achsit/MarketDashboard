// Shared NYSE trading-day helpers, used by capture.js and the history migration script.
// Trading day / weekend checks are based on the UTC date of the run (cron fires at 22:30 UTC,
// after US market close on the same UTC calendar date).

function pad(n) {
  return String(n).padStart(2, '0');
}

function getTradingDateKey(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function isWeekend(isoTimestamp) {
  const day = new Date(isoTimestamp).getUTCDay();
  return day === 0 || day === 6;
}

// Nth (1-based) weekday-of-month occurrence, e.g. nthWeekdayOfMonth(2026, 0, 1, 3) = 3rd Monday of January 2026.
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return dateKey(year, month, day);
}

// Last weekday-of-month occurrence, e.g. lastWeekdayOfMonth(2026, 4, 1) = last Monday of May 2026.
function lastWeekdayOfMonth(year, month, weekday) {
  const lastDayNum = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, lastDayNum));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return dateKey(year, month, lastDayNum - offset);
}

function dateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Anonymous Gregorian algorithm for the date of Easter Sunday.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function goodFriday(year) {
  const easter = easterSunday(year);
  const friday = new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000);
  return dateKey(friday.getUTCFullYear(), friday.getUTCMonth(), friday.getUTCDate());
}

// Fixed-date holidays observed on the nearest weekday if they fall on a weekend.
function observedFixedDate(year, month, day) {
  const date = new Date(Date.UTC(year, month, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1); // Saturday -> observed Friday
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1); // Sunday -> observed Monday
  return dateKey(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function nyseHolidayKeys(year) {
  return new Set([
    observedFixedDate(year, 0, 1), // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3), // MLK Day - 3rd Monday of January
    nthWeekdayOfMonth(year, 1, 1, 3), // Presidents Day - 3rd Monday of February
    goodFriday(year),
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day - last Monday of May
    observedFixedDate(year, 5, 19), // Juneteenth
    observedFixedDate(year, 6, 4), // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day - 1st Monday of September
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving - 4th Thursday of November
    observedFixedDate(year, 11, 25) // Christmas Day
  ]);
}

function isNyseHoliday(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return nyseHolidayKeys(date.getUTCFullYear()).has(getTradingDateKey(isoTimestamp));
}

function isTradingDay(isoTimestamp) {
  return !isWeekend(isoTimestamp) && !isNyseHoliday(isoTimestamp);
}

module.exports = {
  getTradingDateKey,
  isWeekend,
  isNyseHoliday,
  isTradingDay
};
