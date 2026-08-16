#!/usr/bin/env python3
"""Generate og.png (1200x630) — the social share card.

Dark brand ground, faint braid channels echoing the hero band, wordmark and
headline in Helvetica (the site's Archivo/Schibsted faces aren't installed
system-wide, and the share card only needs the silhouette of the brand).
"""
import math

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (10, 10, 10)
TEXT = (242, 242, 240)
MUTED = (168, 168, 168)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# Faint braid channels drifting across the lower half, echoing the hero band.
for i in range(9):
    base_y = 400 + i * 22
    amp = 26 + i * 3
    shade = 34 + i * 4
    pts = []
    for x in range(-20, W + 21, 12):
        y = base_y + amp * math.sin(x / 260 + i * 0.9) + 10 * math.sin(x / 90 + i)
        pts.append((x, y))
    d.line(pts, fill=(shade, shade, shade), width=2)


def font(size, weight="Bold"):
    for path in (
        f"/System/Library/Fonts/Supplemental/Helvetica{'' if weight == 'Regular' else ' ' + weight}.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


wordmark = font(30)
headline = font(86)
sub = font(30, "Regular")

d.text((90, 82), "N O E T I C   S Y N T H E S I S", font=wordmark, fill=MUTED)
d.line([(90, 148), (1110, 148)], fill=(48, 48, 48), width=1)
d.text((86, 200), "We build thinking", font=headline, fill=TEXT)
d.text((86, 300), "partners, not tools.", font=headline, fill=TEXT)
d.text((90, 452), "The Noetic Innovation Cycle — four agents, one loop.", font=sub, fill=MUTED)

img.save("og.png", optimize=True)
print(f"og.png written: {W}x{H}")
