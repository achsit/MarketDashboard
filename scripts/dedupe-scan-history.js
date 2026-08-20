// One-time migration: collapse scan-history.json to one entry per NYSE trading day.
const fs = require('fs');
const path = require('path');
const { getTradingDateKey, isTradingDay } = require('../lib/trading-day');

const scanHistoryPath = path.join(__dirname, '..', 'scan-history.json');

function dedupeHistory(history) {
  const byDate = new Map();

  for (const item of history) {
    if (!isTradingDay(item.timestamp)) continue;
    const dateKey = getTradingDateKey(item.timestamp);
    const existing = byDate.get(dateKey);
    if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
      byDate.set(dateKey, item);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function main() {
  const data = JSON.parse(fs.readFileSync(scanHistoryPath, 'utf8'));

  for (const key of Object.keys(data.scans || {})) {
    const scanState = data.scans[key];
    const history = Array.isArray(scanState.history) ? scanState.history : [];
    scanState.history = dedupeHistory(history);

    const last = scanState.history[scanState.history.length - 1];
    if (last) {
      scanState.count = last.count;
      scanState.lastUpdated = last.timestamp;
    }
  }

  fs.writeFileSync(scanHistoryPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Deduped scan history written to ${scanHistoryPath}`);
}

main();
