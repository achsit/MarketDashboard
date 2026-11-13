// Lightweight checks for America/New_York trading-day attribution.
const assert = require('assert');
const {
  getTradingDateKey,
  isWeekend,
  isTradingDay,
  isNyseHoliday
} = require('../lib/trading-day');

// Delayed Friday post-close run that slips into Saturday UTC must still count as Friday ET.
assert.strictEqual(getTradingDateKey('2026-10-17T00:47:35.864Z'), '2026-10-16');
assert.strictEqual(isWeekend('2026-10-17T00:47:35.864Z'), false);
assert.strictEqual(isTradingDay('2026-10-17T00:47:35.864Z'), true);

// On-time Friday 22:30 UTC cron remains Friday ET.
assert.strictEqual(getTradingDateKey('2026-10-16T22:30:00.000Z'), '2026-10-16');
assert.strictEqual(isTradingDay('2026-10-16T22:30:00.000Z'), true);

// True Saturday afternoon ET is a weekend.
assert.strictEqual(getTradingDateKey('2026-10-17T18:30:00.000Z'), '2026-10-17');
assert.strictEqual(isWeekend('2026-10-17T18:30:00.000Z'), true);
assert.strictEqual(isTradingDay('2026-10-17T18:30:00.000Z'), false);

// Thanksgiving 2026 (Nov 26) is a holiday.
assert.strictEqual(isNyseHoliday('2026-11-26T18:00:00.000Z'), true);
assert.strictEqual(isTradingDay('2026-11-26T18:00:00.000Z'), false);

console.log('trading-day checks passed');
