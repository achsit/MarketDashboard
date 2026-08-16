const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseDir = __dirname;
const screenshotDir = path.join(baseDir, 'screenshots');
const sites = JSON.parse(fs.readFileSync(path.join(baseDir, 'sites.json'), 'utf8'));

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
    'button[aria-label="Close"]'
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1500 })) {
        await locator.click({ timeout: 1500 });
        await sleep(800);
      }
    } catch (_) {}
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

  if (site.selector) {
    const element = page.locator(site.selector).first();
    await element.waitFor({ state: 'visible', timeout: 15000 });

    if (site.waitForFrame) {
      const frameBody = element.contentFrame().locator('body');
      await frameBody.waitFor({ state: 'visible', timeout: 30000 });
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

  if (site.name === 'Yahoo Earnings Calendar') {
    await handleYahooEarnings(page, site, targetFile);
  } else if (site.name === 'CNN Fear and Greed') {
    await sleep(2000);
    await dismissCommonPopups(page);
    await handleFearGreed(page, site, targetFile);
  } else {  
    await handleDefault(page, site, targetFile);
  }
}

async function captureSite(browser, site) {
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1500 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  const targetFile = path.join(screenshotDir, site.file);

  try {
    console.log(`Opening: ${site.name}`);
    await runCapture(page, site, targetFile);
  } catch (error) {
    console.error(`First try failed: ${site.name} -> ${error.message}`);

    try {
      await sleep(site.retryDelayMs || 3000);
      await runCapture(page, site, targetFile);
    } catch (retryError) {
      console.error(`Failed: ${site.name} -> ${retryError.message}`);
    }
  } finally {
    await page.close();
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--disable-http2']
  });

  try {
    for (const site of sites) {
      await captureSite(browser, site);
    }

    const stamp = new Date().toISOString();
    fs.writeFileSync(path.join(screenshotDir, 'last-updated.txt'), stamp);
    console.log(`Finished at ${stamp}`);
  } finally {
    await browser.close();
  }
})();
