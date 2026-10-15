"""Build docs/logo.svg and docs/logo.png for Light Pills Card.

Matches the SWAKES Notify Studio logo layout: the SW tile in front (lower
left), a light panel behind it, and an accent element overflowing the panel.
Here the accent is an expanded light pill with amber light rays.

Run from the repo root:
    python3 dev/build_logo.py
Needs fontTools, Playwright (Chromium) and Pillow, plus Inter Display Bold
(https://rsms.me/inter). The SW lettering is converted to paths, so the SVG
has no font dependency.
"""
import io
import math
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FONT = os.environ.get("LOGO_FONT", "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf")
SIZE = 512
TARGET = 450  # artwork fits a 450px square, same as Notify Studio

# Palette
NAVY = "#1d2742"
TILE_TOP, TILE_MID, TILE_BOTTOM = "#3b4964", "#2a3854", "#1a2740"
SCREEN_TOP, SCREEN_BOTTOM = "#f4f7fd", "#e6ecf6"
PILL_SLATE = "#4b5975"
AMBER_LIGHT, AMBER_DARK = "#ffd78a", "#f5a524"

# Material Design Icons (Apache-2.0), https://pictogrammers.com
MDI = {
    "lightbulb": "M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z",
    "sofa": "M12.5 7C12.5 5.89 13.39 5 14.5 5H18C19.1 5 20 5.9 20 7V9.16C18.84 9.57 18 10.67 18 11.97V14H12.5V7M6 11.96V14H11.5V7C11.5 5.89 10.61 5 9.5 5H6C4.9 5 4 5.9 4 7V9.15C5.16 9.56 6 10.67 6 11.96M20.66 10.03C19.68 10.19 19 11.12 19 12.12V15H5V12C5 10.9 4.11 10 3 10S1 10.9 1 12V17C1 18.1 1.9 19 3 19V21H5V19H19V21H21V19C22.1 19 23 18.1 23 17V12C23 10.79 21.91 9.82 20.66 10.03Z",
    "lamp": "M8,2H16L20,14H4L8,2M11,15H13V20H18V22H6V20H11V15Z",
}

# Layout, in a 512 canvas before auto-fitting
TILE = dict(x=62, y=176, size=260, r=56)
PANEL = dict(x=112, y=70, w=350, h=400, r=50, stroke=14)
PILL = dict(x=292, y=104, w=214, h=84)
RAY_CENTRE = (150, 138)


def icon(name, x, y, size, fill, opacity=1.0):
    scale = size / 24
    return (
        f'<path d="{MDI[name]}" fill="{fill}" opacity="{opacity}" '
        f'transform="translate({x:.2f} {y:.2f}) scale({scale:.4f})"/>'
    )


def sw_lettering():
    """SW as SVG path data, centred in the tile at 73% of its width."""
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    tracking = -0.02 * upm

    # Lay out S then W in font units, collecting bounds
    names = [cmap[ord(ch)] for ch in "SW"]
    offsets, cursor = [], 0
    for name in names:
        offsets.append(cursor)
        cursor += glyphs[name].width + tracking

    bounds = BoundsPen(glyphs)
    for name, off in zip(names, offsets):
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, 1, off, 0)))
    xmin, ymin, xmax, ymax = bounds.bounds

    target_w = TILE["size"] * 0.73
    scale = target_w / (xmax - xmin)
    text_h = (ymax - ymin) * scale
    left = TILE["x"] + (TILE["size"] - target_w) / 2
    top = TILE["y"] + (TILE["size"] - text_h) / 2

    pen = SVGPathPen(glyphs)
    for name, off in zip(names, offsets):
        # font units (y up) -> canvas (y down)
        transform = (scale, 0, 0, -scale, left + (off - xmin) * scale, top + ymax * scale)
        glyphs[name].draw(TransformPen(pen, transform))
    return pen.getCommands()


def rays():
    cx, cy = RAY_CENTRE
    out = []
    for angle in (196, 229, 262):
        a = math.radians(angle)
        x1, y1 = cx + 84 * math.cos(a), cy + 84 * math.sin(a)
        x2, y2 = cx + 124 * math.cos(a), cy + 124 * math.sin(a)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
    return "\n    ".join(out)


def artwork():
    t, p, q = TILE, PANEL, PILL
    pill_cy = q["y"] + q["h"] / 2
    collapsed_y = p["y"] + p["h"] - 28 - 58
    return f"""
  <!-- Light rays -->
  <g stroke="url(#amber)" stroke-width="15" stroke-linecap="round" fill="none">
    {rays()}
  </g>

  <!-- Card panel -->
  <rect x="{p['x']}" y="{p['y']}" width="{p['w']}" height="{p['h']}" rx="{p['r']}"
        fill="url(#screen)" stroke="{NAVY}" stroke-width="{p['stroke']}" filter="url(#soft)"/>
  <rect x="146" y="{p['y'] + 30}" width="104" height="14" rx="7" fill="{NAVY}" opacity="0.85"/>
  <rect x="146" y="{p['y'] + 52}" width="64" height="10" rx="5" fill="{NAVY}" opacity="0.3"/>

  <!-- Collapsed pills -->
  <rect x="330" y="{collapsed_y}" width="58" height="58" rx="17" fill="{PILL_SLATE}"/>
  {icon('sofa', 342, collapsed_y + 12, 34, '#e8edf6', 0.8)}
  <rect x="394" y="{collapsed_y}" width="58" height="58" rx="17" fill="{PILL_SLATE}"/>
  {icon('lamp', 406, collapsed_y + 12, 34, '#e8edf6', 0.8)}

  <!-- Expanded pill, glowing and overflowing the panel -->
  <ellipse cx="{q['x'] + q['w'] / 2 + 8}" cy="{pill_cy}" rx="150" ry="92" fill="url(#glow)"/>
  <rect x="{q['x']}" y="{q['y']}" width="{q['w']}" height="{q['h']}" rx="{q['h'] / 2}"
        fill="url(#amber)" filter="url(#soft)"/>
  {icon('lightbulb', q['x'] + 22, pill_cy - 24, 48, NAVY)}
  <rect x="{q['x'] + 80}" y="{pill_cy - 8}" width="104" height="16" rx="8" fill="{NAVY}"/>

  <!-- SW tile -->
  <g filter="url(#shadow)">
    <rect x="{t['x']}" y="{t['y']}" width="{t['size']}" height="{t['size']}" rx="{t['r']}" fill="url(#tile)"/>
  </g>
  <path d="{sw_lettering()}" fill="#ffffff"/>
"""


def svg(transform="translate(0 0)"):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <title>Light Pills Card</title>
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{TILE_TOP}"/>
      <stop offset="0.45" stop-color="{TILE_MID}"/>
      <stop offset="0.75" stop-color="{TILE_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{SCREEN_TOP}"/>
      <stop offset="1" stop-color="{SCREEN_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{AMBER_LIGHT}"/>
      <stop offset="1" stop-color="{AMBER_DARK}"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="{AMBER_DARK}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="{AMBER_DARK}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0b1222" flood-opacity="0.35"/>
    </filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#0b1222" flood-opacity="0.16"/>
    </filter>
  </defs>
  <g transform="{transform}">{artwork()}</g>
</svg>
"""


def render(page, markup):
    page.set_content(f'<html><body style="margin:0;background:transparent">{markup}</body></html>')
    png = page.locator("svg").screenshot(omit_background=True)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def main():
    if not os.path.exists(FONT):
        sys.exit(f"Font not found: {FONT} (set LOGO_FONT)")
    docs = os.path.join(ROOT, "docs")
    os.makedirs(docs, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": SIZE, "height": SIZE})

        # Measure, then scale and centre into a 450px square. Shadows and the glow
        # don't scale exactly linearly, so a second pass corrects the first.
        transform = ""
        for _ in range(2):
            image = render(page, svg(transform or "translate(0 0)"))
            x0, y0, x1, y1 = image.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
            scale = TARGET / max(x1 - x0, y1 - y0)
            tx = (SIZE - (x1 - x0) * scale) / 2 - x0 * scale
            ty = (SIZE - (y1 - y0) * scale) / 2 - y0 * scale
            transform = f"translate({tx:.2f} {ty:.2f}) scale({scale:.4f}) {transform}".strip()
        final_svg = svg(transform)

        with open(os.path.join(docs, "logo.svg"), "w") as f:
            f.write(final_svg)
        image = render(page, final_svg)
        image.save(os.path.join(docs, "logo.png"), optimize=True)
        browser.close()

    bbox = image.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
    print(f"wrote docs/logo.svg and docs/logo.png ({image.size[0]}x{image.size[1]}, artwork bbox {bbox})")


if __name__ == "__main__":
    main()
