# MarketDashboard

Daily Market Dashboards with Snapshots — a single-page visual briefing arranged from price action to sentiment, breadth, market health, and upcoming macro events.

## Overview

This project automatically captures screenshots of key financial dashboards and assembles them into a single-page HTML dashboard and a captioned PDF report. It runs on a daily schedule via GitHub Actions.

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
| `create_pdf.py` | Builds a lossless captioned PDF from the captured screenshots |
| `.github/workflows/capture.yml` | GitHub Actions workflow — runs on a daily schedule and pushes updated screenshots |

## Setup

### Prerequisites

- Node.js ≥ 20
- Python 3
- Google Drive credentials (for automatic upload — see workflow secrets)

### Install dependencies

```bash
npm ci
npx playwright install --with-deps chromium
python3 -m pip install img2pdf pillow
```

### Run a capture manually

```bash
node capture.js        # captures all screenshots into screenshots/
python3 create_pdf.py  # builds screenshots/screenshots.pdf
```

### View the dashboard

Open `index.html` in a browser after screenshots have been captured.

## GitHub Actions Secrets

The workflow uploads the PDF and screenshots to Google Drive. Configure the following repository secrets:

| Secret | Description |
|--------|-------------|
| `GDRIVE_CLIENT_ID` | OAuth 2.0 client ID |
| `GDRIVE_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GDRIVE_REFRESH_TOKEN` | OAuth 2.0 refresh token |
| `GDRIVE_FOLDER_ID` | Target Google Drive folder ID |
