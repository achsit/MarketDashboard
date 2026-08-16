# MarketDashboard

Daily Market Dashboards with Snapshots — a single-page visual briefing arranged from price action to sentiment, breadth, market health, and upcoming macro events.

## Overview

This project automatically captures screenshots of key financial dashboards and publishes them in a single-page HTML dashboard. It runs daily via GitHub Actions and is published publicly with GitHub Pages.

### Dashboard Sections

1. **Market Performance** — SPY, QQQ, DIA, and IWM daily views from TradingView, plus Finviz daily/weekly sector heat maps
2. **Market Sentiment** — CNN Fear & Greed Index, AAII Investor Sentiment Survey, NAAIM Exposure Index
3. **Market Breadth** — EQWL equal-weight proxy, US New Highs–Lows, and SPX percent above 50/200-day MA
4. **Market Monitor** — Stockbee market-health checklist
5. **Economic Calendar** — Trading Economics upcoming macro releases and central-bank events

## How It Works

| File | Purpose |
|------|---------|
| `capture.js` | Playwright script that visits each URL in `sites.json` and saves a PNG screenshot |
| `sites.json` | List of sites to capture with per-site configuration (URL, selector, wait time, etc.) |
| `index.html` | Static single-page dashboard that displays all screenshots with a lightbox viewer |
| `.github/workflows/capture.yml` | GitHub Actions workflow — captures, commits, and deploys updated screenshots daily |

## Setup

### Prerequisites

- Node.js ≥ 20

### Install dependencies

```bash
npm ci
npx playwright install --with-deps chromium
```

### Run a capture manually

```bash
node capture.js  # captures all screenshots into screenshots/
```

### View the dashboard

Open `index.html` in a browser after screenshots have been captured, or visit the public dashboard at:

https://achsit.github.io/MarketDashboard/

Before the first scheduled run, open the repository's **Settings > Pages** and set **Source** to **GitHub Actions**. The workflow has permission to enable Pages when possible, but repository or organization policies may still require an administrator to enable Pages.

The scheduled workflow runs every day at 06:30 in UTC+8 (22:30 UTC). Each run commits the refreshed PNG snapshots to `screenshots/` and deploys the dashboard through GitHub Pages. If an external site is unavailable, its capture is retried once after a short delay and the workflow continues with the remaining sites; an existing screenshot is left unchanged when a replacement cannot be captured.

The Stockbee snapshot captures the published Google Sheets document directly.
