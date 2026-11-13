const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { getTradingDateKey, isTradingDay } = require('./lib/trading-day');
const { collectTradingViewScanCount } = require('./lib/tradingview-scan');

const baseDir = __dirname;
const screenshotDir = path.join(baseDir, 'screenshots');
const sites = JSON.parse(fs.readFileSync(path.join(baseDir, 'sites.json'), 'utf8'));
const scanHistoryPath = path.join(baseDir, 'scan-history.json');
const scanDefinitions = [
  {
    key: 'up20_5d',
    label: 'Up 20% in 5 days',
    url: 'https://finviz.com/screener?v=210&p=d&f=ind_stocksonly,sh_avgvol_o100,sh_price_o5,ta_perf_1w20o&ft=4&ta=0&dr=m6&o=-perfytd'
  },
  {
    key: 'down20_5d',
    label: 'Down 20% in 5 days',
    url: 'https://finviz.com/screener?v=210&p=d&f=ind_stocksonly,sh_avgvol_o100,sh_price_o5,ta_perf_1w20u&ft=4&ta=0&dr=m6&o=-perfytd'
  }
];

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function dismissCommonPopups(page) {
  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("I Accept")',
    'button:has-text("Agree")',
    'button:has-text("OK")',
    'button:has-text("Got it")',
    '#onetrust-accept-btn-handler',
    '[aria-label="Close"]',
    'button[aria-label="Close"]',
    'button:has-text("×")',
    'button:has-text("✕")',
    '.close',
    '[class*="close"]'
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1200 })) {
        await locator.click({ timeout: 1500 });
        await sleep(600);
      }
    } catch (_) {}
  }
}

async function removeFinvizAnnouncements(page) {
  try {
    await page.evaluate(() => {
      // Only target known Finviz announcement overlays
      const candidates = Array.from(document.querySelectorAll('div, section, aside, dialog'));
      for (const el of candidates) {
        const text = (el.textContent || '').slice(0, 400).toLowerCase();
        const style = window.getComputedStyle(el);
        const isOverlay = style.position === 'fixed' || style.position === 'absolute' || Number(style.zIndex || 0) > 50;
        if (isOverlay && (text.includes('why is it moving') || text.includes('matrix') || text.includes('elite features'))) {
          el.remove();
        }
      }
      // Click close buttons that are clearly on those cards
      document.querySelectorAll('button').forEach(btn => {
        const text = (btn.textContent || '').trim();
        const parentText = (btn.closest('div, section')?.textContent || '').toLowerCase();
        if ((text === '×' || text === '✕') && (parentText.includes('why is it moving') || parentText.includes('matrix'))) {
          try { btn.click(); } catch (_) {}
        }
      });
    });
    await sleep(300);
  } catch (_) {}
}

async function dismissFinvizEliteDialog(page) {
  const closeButton = page.locator('button[data-testid="elite-features-dialog-close"]').first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (await closeButton.isVisible({ timeout: 1000 })) {
        await closeButton.click({ timeout: 2000 });
        await sleep(500);
        return;
      }
    } catch (_) {}

    if (attempt < 2) await sleep(1000);
  }
}

async function dismissFinvizConsentFrames(page) {
  const selectors = [
    'button[title="Reject All"]',
    'button[title="Accept All"]',
    'button:has-text("Reject All")',
    'button:has-text("Accept All")',
    '.message-button'
  ];

  for (const frame of page.frames()) {
    if (!/sp_message_iframe/i.test(frame.name() || frame.url() || '')) continue;

    for (const selector of selectors) {
      try {
        const locator = frame.locator(selector).first();
        if (await locator.isVisible({ timeout: 1000 })) {
          await locator.click({ timeout: 1500 });
          await sleep(500);
          return;
        }
      } catch (_) {}
    }
  }
}

function isFinvizUrl(url) {
  return typeof url === 'string' && url.includes('finviz.com');
}

async function dismissFinvizPopups(page) {
  await dismissFinvizConsentFrames(page);
  await dismissFinvizEliteDialog(page);
  await removeFinvizAnnouncements(page);
}

async function finvizPopupVisible(page) {
  try {
    return await page.evaluate(() => {
      const el = document.querySelector('button[data-testid="elite-features-dialog-close"]');
      const hasAnnouncement = Array.from(document.querySelectorAll('*')).some(n => {
        const t = (n.textContent || '').toLowerCase();
        return t.includes('why is it moving') || t.includes('matrix');
      });
      return (!!el && el.offsetParent !== null) || hasAnnouncement;
    });
  } catch (_) {
    return false;
  }
}

async function handleYahooEarnings(page, site, targetFile) {
  await page.setViewportSize({ width: 2000, height: 1600 });
  await sleep(1000);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1000);

  const section = page.locator('section[data-testid="calendar-event-table"]').first();
  await section.waitFor({ state: 'visible', timeout: 15000 });

  await section.evaluate(el => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
    el.querySelectorAll('*').forEach(node => {
      try {
        node.scrollTop = 0;
        node.scrollLeft = 0;
      } catch (_) {}
    });
  });

  await sleep(1000);
  await removeFinvizAnnouncements(page);

  await section.screenshot({ path: targetFile });
  console.log(`Saved Yahoo earnings section screenshot: ${site.file}`);
}

async function handleFearGreed(page, site, targetFile) {
  await sleep(2500);

  const agreeSelectors = [
    'button:has-text("Agree")',
    'text=Agree',
    '[role="button"]:has-text("Agree")'
  ];

  let clicked = false;

  for (const selector of agreeSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2500 })) {
        await btn.click({ timeout: 2500 });
        await sleep(2000);
        clicked = true;
        break;
      }
    } catch (_) {}
  }

  if (!clicked) {
    try {
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], div'));
        for (const el of candidates) {
          const text = (el.textContent || '').trim();
          if (text === 'Agree') {
            el.click();
            return;
          }
        }
      });
      await sleep(2000);
    } catch (_) {}
  }

  try {
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('body *'));
      for (const el of nodes) {
        const text = (el.textContent || '').toLowerCase();
        const style = window.getComputedStyle(el);

        const looksLikeConsent =
          text.includes('legal terms and privacy') ||
          text.includes('cookies') ||
          text.includes('privacy policy') ||
          text.includes('agree');

        const isOverlay =
          style.position === 'fixed' ||
          style.position === 'sticky' ||
          Number(style.zIndex || 0) > 999;

        if (looksLikeConsent && isOverlay) {
          el.remove();
        }
      }

      document.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="backdrop"]').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || Number(style.zIndex || 0) > 999) {
          el.remove();
        }
      });

      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    });
  } catch (_) {}
  await sleep(1000);
  await removeFinvizAnnouncements(page);

  const element = page.locator('div.market-tabbed-container').first();
  await element.waitFor({ state: 'visible', timeout: 15000 });
  await element.screenshot({ path: targetFile });

  console.log(`Saved Fear and Greed screenshot: ${site.file}`);
}

async function fetchSnapshot(site, targetFile) {
  const res = await fetch(site.snapshot, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(targetFile, buffer);
  console.log(`Saved snapshot image: ${site.file}`);
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Could not read ${filePath}: ${error.message}`);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function browserContextOptions(extra = {}) {
  return {
    viewport: { width: 1800, height: 1500 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 1,
    ...extra
  };
}

function isCloudflareChallengeTitle(title) {
  return /just a moment|attention required|cloudflare/i.test(title || '');
}

async function waitForCloudflareClear(page, timeoutMs = 90000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const title = await page.title().catch(() => '');
    if (!isCloudflareChallengeTitle(title)) return title;
    await sleep(1000);
  }

  const title = await page.title().catch(() => '');
  throw new Error(`Cloudflare challenge did not clear after ${timeoutMs}ms (title: ${title || 'unknown'})`);
}

function parseScreenerTotalText(text) {
  if (!text) return null;
  const match = text.match(/\b([\d,]+)\s*\/\s*([\d,]+)\s*Total\b/i) || text.match(/\b([\d,]+)\s*Total\b/i);
  if (!match) return null;
  return Number((match[2] || match[1]).replace(/,/g, ''));
}

async function readScreenerTotal(page) {
  const selectors = [
    '#screener-total',
    '#screener_views_table_wrapper #screener-total',
    '[id*="screener-total"]',
    'td#screener-total',
    '.screener-pages',
    '#screenerContent'
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (!(await locator.count())) continue;
      await locator.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
      const text = (await locator.innerText().catch(() => '')) || '';
      const count = parseScreenerTotalText(text);
      if (count !== null) {
        return { count, text: text.trim(), selector };
      }
    } catch (_) {}
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const count = parseScreenerTotalText(bodyText);
  if (count !== null) {
    return { count, text: bodyText.match(/[\d,/]+\s*Total/i)?.[0] || String(count), selector: 'body' };
  }

  return null;
}

async function dumpScanDebug(page, scan, error) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(screenshotDir, `scan-debug-${scan.key}-${stamp}`);

  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    console.error(`Saved scan debug screenshot: ${path.basename(base)}.png`);
  } catch (screenshotError) {
    console.error(`Could not save scan debug screenshot: ${screenshotError.message}`);
  }

  try {
    const title = await page.title().catch(() => '');
    const url = page.url();
    const html = await page.content().catch(() => '');
    const snippet = html.slice(0, 4000);
    fs.writeFileSync(
      `${base}.txt`,
      [
        `label: ${scan.label}`,
        `url: ${url}`,
        `title: ${title}`,
        `error: ${error.message}`,
        '',
        snippet
      ].join('\n')
    );
    console.error(`Saved scan debug dump: ${path.basename(base)}.txt`);
  } catch (dumpError) {
    console.error(`Could not save scan debug dump: ${dumpError.message}`);
  }
}

async function collectFinvizScanCount(page, scan) {
  await page.goto(scan.url, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });

  await waitForCloudflareClear(page);
  await sleep(2500);
  await dismissCommonPopups(page);
  await dismissFinvizPopups(page);

  const deadline = Date.now() + 45000;
  let parsed = null;

  while (Date.now() < deadline) {
    parsed = await readScreenerTotal(page);
    if (parsed) break;
    await dismissFinvizPopups(page);
    await sleep(1500);
  }

  if (!parsed) {
    const title = await page.title().catch(() => '');
    throw new Error(`No scan count found for ${scan.label} (title: ${title || 'unknown'})`);
  }

  console.log(`Parsed ${scan.label} via ${parsed.selector}: ${parsed.text}`);

  return {
    key: scan.key,
    label: scan.label,
    url: scan.url,
    count: parsed.count,
    timestamp: new Date().toISOString(),
    rawText: parsed.text
  };
}

async function warmFinvizSession(browser, storageState = null) {
  const contextOptions = browserContextOptions({
    viewport: { width: 1800, height: 1200 }
  });
  if (storageState) contextOptions.storageState = storageState;

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    console.log('Warming Finviz session before scan counts');
    await page.goto('https://finviz.com/map?colorscale=colorblind', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    await waitForCloudflareClear(page);
    await sleep(2000);
    await dismissCommonPopups(page);
    await dismissFinvizPopups(page);
    return await context.storageState();
  } catch (error) {
    console.error(`Finviz warm-up failed: ${error.message}`);
    return storageState;
  } finally {
    await page.close();
    await context.close();
  }
}

async function collectScanCountWithFallback(browser, scan, storageState = null) {
  const contextOptions = browserContextOptions({
    viewport: { width: 1800, height: 1200 }
  });
  if (storageState) contextOptions.storageState = storageState;

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    console.log(`Collecting scan count via Finviz: ${scan.label}`);
    const result = await collectFinvizScanCount(page, scan);
    result.source = 'finviz';
    return result;
  } catch (error) {
    console.error(`Finviz scan count failed for ${scan.label}: ${error.message}`);
    await dumpScanDebug(page, scan, error);
  } finally {
    await page.close();
    await context.close();
  }

  console.log(`Falling back to TradingView scanner for ${scan.label}`);
  return collectTradingViewScanCount(scan);
}

async function captureScanCounts(browser, storageState = null) {
  const entries = [];
  const warmedState = await warmFinvizSession(browser, storageState);

  for (const scan of scanDefinitions) {
    try {
      const result = await collectScanCountWithFallback(browser, scan, warmedState);
      console.log(`Collected ${scan.label}: ${result.count} (source=${result.source})`);
      entries.push(result);
    } catch (error) {
      console.error(`Failed to collect scan count for ${scan.label}: ${error.message}`);
    }
  }

  return entries;
}

async function updateScanHistory(entries) {
  if (!entries.length) return { saved: false, skipped: [] };

  const data = readJsonFile(scanHistoryPath, { updatedAt: null, scans: {} });
  const timestamp = new Date().toISOString();
  let changed = false;
  const skipped = [];

  for (const entry of entries) {
    if (!isTradingDay(entry.timestamp)) {
      console.log(`Skipping ${entry.label} count: ${entry.timestamp} is not a trading day (weekend/holiday)`);
      skipped.push(entry.key);
      continue;
    }

    const key = entry.key;
    const scanState = data.scans[key] || { label: entry.label, url: entry.url, history: [] };
    const history = Array.isArray(scanState.history) ? scanState.history : [];
    const dateKey = getTradingDateKey(entry.timestamp);
    const existingIndex = history.findIndex(item => getTradingDateKey(item.timestamp) === dateKey);

    const historyItem = { timestamp: entry.timestamp, count: entry.count };
    if (entry.source) historyItem.source = entry.source;

    if (existingIndex >= 0) {
      history[existingIndex] = historyItem;
    } else {
      history.push(historyItem);
    }

    scanState.history = history;
    scanState.label = entry.label;
    scanState.url = entry.url;
    scanState.count = entry.count;
    scanState.lastUpdated = entry.timestamp;
    if (entry.source) scanState.source = entry.source;
    data.scans[key] = scanState;
    changed = true;
  }

  if (!changed) {
    console.log('No trading-day scan counts to save; skipping scan-history.json update');
    return { saved: false, skipped };
  }

  data.updatedAt = timestamp;
  writeJsonFile(scanHistoryPath, data);
  console.log(`Saved scan counts to ${scanHistoryPath}`);
  return { saved: true, skipped };
}

function assertRequiredScanCounts(entries) {
  const now = new Date().toISOString();
  if (!isTradingDay(now)) {
    console.log(`Non-trading day (${getTradingDateKey(now)} ET): scan count gaps are non-fatal`);
    return;
  }

  const collected = new Set(entries.map(entry => entry.key));
  const missing = scanDefinitions
    .filter(scan => !collected.has(scan.key))
    .map(scan => scan.label);

  if (missing.length) {
    throw new Error(`Missing scan counts on trading day ${getTradingDateKey(now)} ET: ${missing.join(', ')}`);
  }
}

async function handleSchrtsChart(page, site, targetFile) {
  // schrts.co pages: pick the largest visible image (the chart), not the logo
  await page.waitForSelector('img', { timeout: 15000 });
  await sleep(1000);
  const box = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    let best = null;
    let bestArea = 0;
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 200 && r.height > 100) {
        bestArea = area;
        best = img;
      }
    }
    if (!best) return null;
    best.scrollIntoView({ block: 'center' });
    return { w: best.naturalWidth || best.width, h: best.naturalHeight || best.height };
  });
  await sleep(500);
  // Screenshot the largest chart image
  const chart = page.locator('img').filter({ hasNot: page.locator('[width="1"], [height="1"]') }).first();
  // Better: use evaluate to mark the largest, then screenshot it
  await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    let best = null, bestArea = 0;
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 200) { bestArea = area; best = img; }
    }
    if (best) best.setAttribute('data-chart-target', '1');
  });
  const target = page.locator('img[data-chart-target="1"]').first();
  await target.waitFor({ state: 'visible', timeout: 10000 });
  await target.screenshot({ path: targetFile });
  console.log(`Saved schrts chart: ${site.file}`);
}


async function handleTradingEconomicsCalendar(page, site, targetFile) {
  // 3-star importance + UTC+8 (480 minutes east of UTC; no DST)
  await page.context().addCookies([
    {
      name: 'calendar-importance',
      value: '3',
      domain: '.tradingeconomics.com',
      path: '/'
    },
    {
      name: 'TECalendarOffset',
      value: '480',
      domain: '.tradingeconomics.com',
      path: '/'
    }
  ]);

  await page.goto(site.url, {
    waitUntil: 'domcontentloaded',
    timeout: site.navigationTimeoutMs || 90000
  });

  await sleep(site.waitAfterLoadMs || 8000);
  await dismissCommonPopups(page);

  // Cookie alone is not always applied; force the timezone dropdown when needed.
  const tzSelect = page.locator('#DropDownListTimezone');
  if (await tzSelect.count()) {
    const current = await tzSelect.inputValue().catch(() => '');
    if (current !== '480') {
      await tzSelect.selectOption('480');
      await sleep(site.waitAfterLoadMs || 8000);
      await dismissCommonPopups(page);
    }
  }

  // Extra wait for the filtered table
  await page.locator('table.table').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await sleep(1500);

  const element = page.locator('table.table').first();
  await element.screenshot({ path: targetFile });
  console.log(`Saved Trading Economics US 3-star calendar: ${site.file}`);
}

async function handleDefault(page, site, targetFile) {
  if (site.snapshot) {
    try {
      await fetchSnapshot(site, targetFile);
      return;
    } catch (err) {
      console.log(`Snapshot fetch failed for ${site.name}: ${err.message}; falling back to screenshot`);
    }
  }

  if (site.scrollY) {
    await page.mouse.wheel(0, site.scrollY);
    await sleep(1500);
  }

  await dismissCommonPopups(page);

  if (site.selector) {
    if (isFinvizUrl(site.url)) {
      await dismissFinvizPopups(page);
    }

    const element = page.locator(site.selector).first();
    await element.waitFor({ state: 'visible', timeout: 15000 });

    if (site.waitForFrame) {
      const frameBody = element.contentFrame().locator('body');
      await frameBody.waitFor({ state: 'visible', timeout: 30000 });
    }

    if (isFinvizUrl(site.url)) {
      await dismissFinvizPopups(page);
      if (await finvizPopupVisible(page)) {
        await sleep(500);
        await dismissFinvizPopups(page);
      }
    }

    await element.screenshot({ path: targetFile });
    console.log(`Saved selector screenshot: ${site.file}`);
    return;
  }

  if (site.crop) {
    await page.screenshot({
      path: targetFile,
      clip: {
        x: site.crop.x,
        y: site.crop.y,
        width: site.crop.width,
        height: site.crop.height
      }
    });
    console.log(`Saved cropped screenshot: ${site.file}`);
    return;
  }

  await page.screenshot({
    path: targetFile,
    fullPage: false
  });

  console.log(`Saved: ${site.file}`);
}

async function runCapture(page, site, targetFile) {
  await page.goto(site.url, {
    waitUntil: 'domcontentloaded',
    timeout: site.navigationTimeoutMs || 90000
  });

  await sleep(site.waitAfterLoadMs || 5000);
  await dismissCommonPopups(page);

  if (isFinvizUrl(site.url)) {
    await dismissFinvizPopups(page);
  }

  if (site.name === 'Yahoo Earnings Calendar') {
    await handleYahooEarnings(page, site, targetFile);
  } else if (site.name === 'CNN Fear and Greed') {
    await sleep(2000);
    await dismissCommonPopups(page);
    await handleFearGreed(page, site, targetFile);
  } else if (site.name === 'Trading Economics Calendar') {
    await handleTradingEconomicsCalendar(page, site, targetFile);
  } else if (site.url && site.url.includes('schrts.co')) {
    await handleSchrtsChart(page, site, targetFile);
  } else {
    await handleDefault(page, site, targetFile);
  }
}

async function captureSite(browser, site) {
  const contextOptions = browserContextOptions();
  // TE calendar times follow the browser timezone unless TECalendarOffset is honored server-side.
  if (site.name === 'Trading Economics Calendar') {
    contextOptions.timezoneId = 'Asia/Shanghai';
  }
  const context = await browser.newContext(contextOptions);

  const page = await context.newPage();
  const targetFile = path.join(screenshotDir, site.file);
  let storageState = null;

  try {
    console.log(`Opening: ${site.name}`);
    await runCapture(page, site, targetFile);
    if (isFinvizUrl(site.url)) {
      storageState = await context.storageState();
    }
  } catch (error) {
    console.error(`First try failed: ${site.name} -> ${error.message}`);

    try {
      await sleep(site.retryDelayMs || 3000);
      await runCapture(page, site, targetFile);
      if (isFinvizUrl(site.url)) {
        storageState = await context.storageState();
      }
    } catch (retryError) {
      console.error(`Failed: ${site.name} -> ${retryError.message}`);
    }
  } finally {
    await page.close();
    await context.close();
  }

  return storageState;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--disable-http2']
  });

  let finvizStorageState = null;

  try {
    for (const site of sites) {
      const storageState = await captureSite(browser, site);
      if (storageState) finvizStorageState = storageState;
    }

    const scanEntries = await captureScanCounts(browser, finvizStorageState);
    await updateScanHistory(scanEntries);

    const stamp = new Date().toISOString();
    fs.writeFileSync(path.join(screenshotDir, 'last-updated.txt'), stamp);
    console.log(`Finished at ${stamp}`);

    assertRequiredScanCounts(scanEntries);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(`Capture failed: ${error.message}`);
  process.exitCode = 1;
});
