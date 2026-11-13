// Manual probe: exercise Finviz scan-count collection without capturing every dashboard site.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { getTradingDateKey, isTradingDay } = require('../lib/trading-day');

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      const text = (await locator.innerText().catch(() => '')) || '';
      const count = parseScreenerTotalText(text);
      if (count !== null) return { count, text: text.trim(), selector };
    } catch (_) {}
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const count = parseScreenerTotalText(bodyText);
  if (count !== null) {
    return { count, text: bodyText.match(/[\d,/]+\s*Total/i)?.[0] || String(count), selector: 'body' };
  }
  return null;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--disable-http2']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1800, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    console.log('Warming Finviz map...');
    await page.goto('https://finviz.com/map?colorscale=colorblind', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    const warmTitle = await waitForCloudflareClear(page);
    console.log(`Warm title: ${warmTitle}`);
    const storageState = await context.storageState();
    await page.close();
    await context.close();

    for (const scan of scanDefinitions) {
      const scanContext = await browser.newContext({
        viewport: { width: 1800, height: 1200 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
        storageState
      });
      const scanPage = await scanContext.newPage();
      try {
        console.log(`Collecting: ${scan.label}`);
        await scanPage.goto(scan.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const title = await waitForCloudflareClear(scanPage);
        console.log(`  title: ${title}`);
        await sleep(2500);

        let parsed = null;
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline) {
          parsed = await readScreenerTotal(scanPage);
          if (parsed) break;
          await sleep(1500);
        }

        if (!parsed) {
          const out = path.join(__dirname, '..', 'screenshots', `scan-debug-probe-${scan.key}.png`);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          await scanPage.screenshot({ path: out, fullPage: true });
          throw new Error(`No count found; wrote ${out}`);
        }

        const now = new Date().toISOString();
        console.log(`  OK via ${parsed.selector}: ${parsed.count} (${parsed.text})`);
        console.log(`  tradingDay=${getTradingDateKey(now)} isTradingDay=${isTradingDay(now)}`);
      } finally {
        await scanPage.close();
        await scanContext.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
