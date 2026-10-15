"""Record docs/demo.gif from the preview page.

Run from the repo root with the preview served on :8765:
    python3 -m http.server 8765 &
    python3 dev/record_demo.py
Needs Playwright (Chromium) and ffmpeg.
"""
import glob
import os
import shutil
import subprocess
import tempfile
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("PREVIEW_URL", "http://localhost:8765/dev/preview.html")
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "demo.gif")
W, H, SCALE = 480, 220, 2

tmp = tempfile.mkdtemp()
with sync_playwright() as p:
    browser = p.chromium.launch()
    # Playwright pads rather than scales video, so render at full size and zoom the page
    ctx = browser.new_context(
        viewport={"width": W * SCALE, "height": H * SCALE},
        record_video_dir=tmp,
        record_video_size={"width": W * SCALE, "height": H * SCALE},
    )
    t0 = time.time()
    page = ctx.new_page()
    page.goto(URL)
    page.wait_for_function("window.previewReady === true")
    # Only the two main cards, no page furniture
    page.add_style_tag(
        content=f"""
        html {{ zoom: {SCALE}; }}
        body {{ padding: 20px; }}
        h1, p.hint, #log, .label, #slot-themed {{ display: none !important; }}
        .grid {{ gap: 20px; max-width: 440px; }}
        """
    )
    page.wait_for_timeout(600)
    start = time.time() - t0

    def tap(card, index, wait=1100):
        page.locator(f"#{card} .pill").nth(index).click()
        page.wait_for_timeout(wait)

    page.wait_for_timeout(700)
    tap("original", 0)          # TV on, expands
    tap("original", 1)          # Sofa on too, both collapse
    tap("original", 0)          # TV off, Sofa expands
    tap("original", 1, 500)     # all off
    tap("long", 0)              # Living Room expands
    tap("long", 1)              # Kitchen Island too, both collapse
    tap("long", 0)              # Kitchen Island expands
    tap("long", 1, 900)         # all off
    end = time.time() - t0
    ctx.close()
    browser.close()

video = glob.glob(os.path.join(tmp, "*.webm"))[0]
palette = os.path.join(tmp, "palette.png")
filters = f"fps=25,scale={W * 3 // 2}:-1:flags=lanczos"
common = ["-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}", "-i", video]
subprocess.run(["ffmpeg", *common, "-vf", f"{filters},palettegen=stats_mode=diff", palette], check=True)
subprocess.run(
    ["ffmpeg", *common, "-i", palette, "-lavfi", f"{filters}[x];[x][1:v]paletteuse=dither=none", "-loop", "0", OUT],
    check=True,
)
shutil.rmtree(tmp)
print(f"wrote {os.path.abspath(OUT)} ({os.path.getsize(OUT) // 1024} KB, {end - start:.1f}s)")
