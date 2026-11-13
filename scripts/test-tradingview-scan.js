const assert = require('assert');
const { fetchTradingViewCount } = require('../lib/tradingview-scan');

(async () => {
  const up = await fetchTradingViewCount('up');
  const down = await fetchTradingViewCount('down');

  assert.ok(Number.isFinite(up), `up count should be finite, got ${up}`);
  assert.ok(Number.isFinite(down), `down count should be finite, got ${down}`);
  assert.ok(up >= 0 && down >= 0, 'counts should be non-negative');

  console.log(`tradingview-scan checks passed (up=${up}, down=${down})`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
