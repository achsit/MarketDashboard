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

async function handleCME(page, site, targetFile) {
  await page.evaluate((y) => window.scrollBy(0, y), site.preClickScrollY || 400);
  await sleep(1500);

  const fedwatchFrame = page.frameLocator('iframe[src*="IntegratedFedWatchTool"]');
  await sleep(5000);

  try {
    const probTab = fedwatchFrame.locator('#ctl00_MainContent_ucViewControl_IntegratedFedWatchTool_lbPTree');
    await probTab.waitFor({ state: 'visible', timeout: 15000 });
    await probTab.click();
    console.log('Clicked Probabilities inside FedWatch frame by id');
    await sleep(4000);
  } catch (e) {
    console.log('Probabilities tab click inside frame failed:', e.message);
  }

  const tableElement = fedwatchFrame
    .locator('table.grid-thm.grid-thm-v2')
    .filter({
      has: fedwatchFrame.locator('text=CME FedWatch Tool - Conditional Meeting Probabilities')
    })
    .first();

  await tableElement.waitFor({ state: 'visible', timeout: 15000 });

  await tableElement.screenshot({
    path: targetFile
  });

  console.log(`Saved probabilities table-only screenshot: ${site.file}`);
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

async function handleDefault(page, site, targetFile) {
  if (site.scrollY) {
    await page.mouse.wheel(0, site.scrollY);
    await sleep(1500);
  }

  if (site.selector) {
    const element = page.locator(site.selector).first();
    await element.waitFor({ state: 'visible', timeout: 15000 });
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
    timeout: 90000
  });

  await sleep(site.waitAfterLoadMs || 5000);
  await dismissCommonPopups(page);

  if (site.name === 'CME FedWatch Tool') {
    await handleCME(page, site, targetFile);
  } else if (site.name === 'Yahoo Earnings Calendar') {
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
