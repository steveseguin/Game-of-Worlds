#!/usr/bin/env python3
"""Resize one image for the web root, preserving alpha.

Called by tools/publish-art.js. Separate from build-lore-production-assets.py
because that script rebuilds the reference library itself; this one only makes
runtime derivatives small enough to ship.

    python tools/_resize-art.py <src> <dst> <size> [--trim]

--trim removes uniform letterbox bars first: several production sources are
painted inside a 4:3 region on a square canvas, and scaling that whole canvas
into a square UI slot leaves the art floating in dead space.
"""

import sys
from PIL import Image, ImageChops


def trim_uniform_border(img):
    """Drop rows/columns that match the corner colour on all four edges."""
    rgb = img.convert("RGB")
    bg = Image.new("RGB", rgb.size, rgb.getpixel((0, 0)))
    diff = ImageChops.difference(rgb, bg)
    box = diff.getbbox()
    # Refuse a crop that would eat almost everything — that means the image is
    # nearly uniform and the bbox is noise, not a letterbox.
    if not box:
        return img
    w, h = img.size
    cw, ch = box[2] - box[0], box[3] - box[1]
    if cw < w * 0.2 or ch < h * 0.2:
        return img
    return img.crop(box)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) < 3:
        print("usage: _resize-art.py <src> <dst> <size> [--trim]", file=sys.stderr)
        return 2

    src, dst, size = args[0], args[1], int(args[2])
    img = Image.open(src)
    img = img.convert("RGBA")

    if "--trim" in flags:
        img = trim_uniform_border(img)

    img.thumbnail((size, size), Image.LANCZOS)
    img.save(dst, "PNG", optimize=True)
    print(f"{dst} {img.size[0]}x{img.size[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
