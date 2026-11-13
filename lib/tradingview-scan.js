// TradingView scanner fallback for Finviz weekly +/-20% screen counts.
// Filters intentionally mirror the Finviz rules used in capture.js:
// stocks only, primary listing, price > $5, avg volume > 100k, weekly perf +/-20%.

const SCANNER_URL = 'https://scanner.tradingview.com/america/scan';

function buildFilters(direction) {
  const perfFilter = direction === 'up'
    ? { left: 'Perf.W', operation: 'greater', right: 20 }
    : { left: 'Perf.W', operation: 'less', right: -20 };

  return [
    { left: 'type', operation: 'equal', right: 'stock' },
    { left: 'typespecs', operation: 'has', right: ['common'] },
    { left: 'exchange', operation: 'in_range', right: ['AMEX', 'NASDAQ', 'NYSE'] },
    { left: 'close', operation: 'greater', right: 5 },
    // Closest public proxy for Finviz's ~3-month average volume filter.
    { left: 'average_volume_90d_calc', operation: 'greater', right: 100000 },
    { left: 'is_primary', operation: 'equal', right: true },
    perfFilter
  ];
}

async function fetchTradingViewCount(direction) {
  const body = {
    filter: buildFilters(direction),
    options: { lang: 'en' },
    markets: ['america'],
    symbols: { query: { types: [] }, tickers: [] },
    columns: ['name', 'close', 'Perf.W', 'average_volume_90d_calc'],
    sort: {
      sortBy: 'Perf.W',
      sortOrder: direction === 'up' ? 'desc' : 'asc'
    },
    range: [0, 0]
  };

  const response = await fetch(SCANNER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`TradingView scanner HTTP ${response.status}`);
  }

  const data = await response.json();
  const count = Number(data && data.totalCount);
  if (!Number.isFinite(count)) {
    throw new Error(`TradingView scanner returned no totalCount: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return count;
}

async function collectTradingViewScanCount(scan) {
  const direction = scan.key === 'down20_5d' ? 'down' : 'up';
  const count = await fetchTradingViewCount(direction);

  return {
    key: scan.key,
    label: scan.label,
    url: scan.url,
    count,
    timestamp: new Date().toISOString(),
    rawText: `tradingview totalCount=${count}`,
    source: 'tradingview'
  };
}

module.exports = {
  collectTradingViewScanCount,
  fetchTradingViewCount
};
