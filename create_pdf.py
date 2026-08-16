"""
create_pdf.py

Builds a single captioned PDF from screenshots in the screenshots/ folder,
in a hardcoded custom order, WITHOUT losing image quality.

Key fix vs previous versions:
  - Captions are burned onto each PNG using PIL (lossless pixel operations),
    adding a plain white strip above the original screenshot and drawing
    text on that strip only. The chart/screenshot pixels themselves are
    never touched, resampled, or recompressed.
  - The captioned PNGs are then assembled into a PDF using img2pdf, which
    embeds images byte-for-byte with NO re-encoding (unlike ReportLab's
    drawImage, which JPEG-compresses images by default and blurs fine
    chart text/candlesticks).

Edit ORDERED_IMAGES to control:
  - which images are included
  - what order they appear in the PDF
  - what caption is printed above each image
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import img2pdf
import textwrap
import shutil

SCREENSHOTS_DIR = Path("screenshots")
CAPTIONED_DIR = SCREENSHOTS_DIR / "_captioned"
OUTPUT_PDF = SCREENSHOTS_DIR / "screenshots.pdf"

# --- EDIT THIS LIST: (filename, caption) in the exact order you want them in the PDF ---
ORDERED_IMAGES = [
    ("finviz.png", "1. Market Performance — intraday key indices performance in previous trading session (S&P 500, NASDAQ, DOW, RUSSELL 2000)"),
    ("heatmap_d.png", "1. Market Performance — sectors and industries heatmap based on daily change data"),
    ("heatmap_w.png", "1. Market Performance — sectors and industries heatmap based on weekly change data"),
    ("fear-greed.png", "2. Market Sentiment — Fear & Greed Index - latest value shows on the gauge on left part of the image, compare it with previous close/1 week ago/1 month ago/1 year ago values listed on the right part of the image"),
    ("naaim.png", "2. Market Sentiment — NAAIM Exposure Index (Actual adjustments active risk managers have made to client accounts over the past two weeks)"),
    ("aaii.png", "2. Market Sentiment — AAII Investor Sentiment Survey (Opinions of individual investors on where the market is heading in the next six months) - compare the latest week bullish (blue) and bearish (red) readings to that of the previous weeks to monitor the sentiment trend"),
    ("ushl.png", "3. Market Breadth — $USHL (Positive net new highs show broad market strength and a healthy bull market) & $NYAD (A rising NYAD confirms that a market rally is backed by widespread stock participation) and their respective 10-Day Moving Average"),
    ("abv50200_SP500.png", "3. Market Breadth — S&P500 Percent of Stocks Above 50 Day & 200 Day Moving Average and their respective 10-Day Moving Average"),
    ("abv50200_COMPQ.png", "3. Market Breadth — COMPQ Percent of Stocks Above 50 Day & 200 Day Moving Average and their respective 10-Day Moving Average"),
    ("abv50200_NYA.png", "3. Market Breadth — NYSE Percent of Stocks Above 50 Day & 200 Day Moving Average and their respective 10-Day Moving Average"),
    ("abv50200_INDU.png", "3. Market Breadth — Dow Jones Industrials Percent of Stocks Above 50 Day & 200 Day Moving Average and their respective 10-Day Moving Average"),
    ("vix.png", "4. Exit Indicator — $VIX (Values below 20 indicate a calm market, while values above 30 signal high investor anxiety, uncertainty, or market sell-offs)"),
    ("hyioas.png", "4. Exit Indicator — US High Yield Index Option-Adjusted Spread (Value below 4 signals a strong economy where investors are confident and willing to accept less premium for taking on default risk, while value above 5 signals extreme market stress, economic fear, or an impending recession as investors panic-sell corporate debt)"),
    ("cme.png", "5. Economic Indicator — Conidtional Meeting Probabilities (Likelihood that the Fed will change the Federal target rate at upcoming FOMC meetings)"),
    ("t10y3m.png", "5. Economic Indicator — 10-Year Treasury Constant Maturity Minus 30Month Treasury Constant Maturity (Positve means investors expect the economy to grow and demand higher interest rates against inflation; Negative means extreme investor anxiety, investors believe economic trouble is brewing soon and rush to lock in long-term 10-year yields before the Federal Reserve is forced to slash interest rates to combat a recession)"),
    ("yieldcurve.png", "5. Economic Indicator — Normally slopes up from left to right, implies healthy, expanding economy with normal inflation expecations; Flat implies economic transition or uncertainty; Inverted implies heavy fear of an impending recession"),
    ("earnings-calendar.png", "6. Imortant Events — Earnings Calendar (For upcoming big names)"),
    ("spotgamma-earnings.png", "6. Implied Earnings Moves Chart for Top Names — The estimated move is based off of the at-the-money straddle for the first expiration date after a stock's scheduled earnings date"),
    ("economic-calendar.png", "6. Imortant Events — Economic Calendar (For upcoming major US events)")
    # Add more (filename, caption) pairs here as needed
]
# ------------------------------------------------------------------------------------------

FONT_SIZE = 26
CAPTION_PADDING = 16
LINE_SPACING = 6
BG_COLOR = (255, 255, 255)
TEXT_COLOR = (0, 0, 0)


def get_font(size):
    # DejaVuSans-Bold ships with most Linux images (incl. GitHub Actions ubuntu-latest).
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wrap_caption(draw, text, font, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        w = draw.textlength(candidate, font=font)
        if w <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [text]


def add_caption(src_path: Path, caption: str, dst_path: Path):
    img = Image.open(src_path).convert("RGB")
    iw, ih = img.size

    font = get_font(FONT_SIZE)

    dummy = Image.new("RGB", (iw, 10))
    dummy_draw = ImageDraw.Draw(dummy)
    max_text_width = iw - 2 * CAPTION_PADDING
    lines = wrap_caption(dummy_draw, caption, font, max_text_width)

    line_height = FONT_SIZE + LINE_SPACING
    caption_band_height = CAPTION_PADDING * 2 + line_height * len(lines)

    new_img = Image.new("RGB", (iw, ih + caption_band_height), BG_COLOR)
    draw = ImageDraw.Draw(new_img)

    y = CAPTION_PADDING
    for line in lines:
        draw.text((CAPTION_PADDING, y), line, font=font, fill=TEXT_COLOR)
        y += line_height

    # Paste the ORIGINAL screenshot pixels unchanged — no resize, no recompression.
    new_img.paste(img, (0, caption_band_height))

    new_img.save(dst_path, format="PNG")  # PNG = lossless


def build_pdf():
    if CAPTIONED_DIR.exists():
        shutil.rmtree(CAPTIONED_DIR)
    CAPTIONED_DIR.mkdir(parents=True)

    ordered_paths = []
    missing = []

    for filename, caption in ORDERED_IMAGES:
        src = SCREENSHOTS_DIR / filename
        if not src.exists():
            missing.append(filename)
            continue
        dst = CAPTIONED_DIR / filename
        add_caption(src, caption, dst)
        ordered_paths.append(str(dst))

    if missing:
        print(f"Warning: missing files skipped: {missing}")

    if not ordered_paths:
        raise SystemExit("No matching PNG files found in screenshots/. Check ORDERED_IMAGES.")

    with open(OUTPUT_PDF, "wb") as f:
        f.write(img2pdf.convert(ordered_paths))

    shutil.rmtree(CAPTIONED_DIR)
    print(f"Created {OUTPUT_PDF} with {len(ordered_paths)} page(s), original chart resolution preserved.")


if __name__ == "__main__":
    build_pdf()
