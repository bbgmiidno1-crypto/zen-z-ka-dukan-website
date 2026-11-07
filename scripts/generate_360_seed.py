#!/usr/bin/env python3
"""Generate persistent, lightweight 8-frame editorial angle sequences.

The original seed catalogue has two distinct photographs per colourway. This
script creates a smooth, deterministic transition sequence from those real
photographs so every existing product has an interactive viewer immediately.
Admin-uploaded 8/12/16/24/36 true angle photographs replace these frames for
any colour variant without touching products, orders or customer records.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SEED_MANIFEST = ROOT / "data" / "seed-manifest.json"
MEDIA_ROOT = ROOT / "data" / "uploads" / "seed"
OUT_ROOT = MEDIA_ROOT / "spin"
OUT_MANIFEST = ROOT / "data" / "seed-360-manifest.json"

FULL_SIZE = (900, 1125)
THUMB_SIZE = (360, 450)
FRAME_COUNT = 8
BLEND_WEIGHTS = [0.0, 0.18, 0.38, 0.58, 0.78, 0.94, 0.60, 0.28]


def disk_path(media_url: str) -> Path:
    if not media_url.startswith("/media/seed/"):
        raise ValueError(f"Unexpected seed media URL: {media_url}")
    return MEDIA_ROOT / media_url.removeprefix("/media/seed/")


def editorial_frame(first: Image.Image, second: Image.Image, index: int) -> Image.Image:
    weight = BLEND_WEIGHTS[index]
    frame = Image.blend(first, second, weight)
    theta = (index / FRAME_COUNT) * math.pi * 2
    shift = 10 * math.sin(theta)
    width, height = FULL_SIZE
    # PIL QUAD order is upper-left, lower-left, lower-right, upper-right.
    quad = (
        shift,
        0,
        -shift * 0.45,
        height,
        width + shift * 0.45,
        height,
        width - shift,
        0,
    )
    frame = frame.transform(
        FULL_SIZE,
        Image.Transform.QUAD,
        quad,
        resample=Image.Resampling.BICUBIC,
        fillcolor=(8, 8, 8),
    )
    brightness = 0.975 + 0.025 * math.cos(theta - 0.45)
    return ImageEnhance.Brightness(frame).enhance(brightness)


def main() -> None:
    manifest = json.loads(SEED_MANIFEST.read_text())
    output_products: dict[str, dict] = {}
    total_frames = 0
    total_bytes = 0

    for product_slug, product in manifest["products"].items():
        colors = []
        for color in product["colors"]:
            sources = color["images"]
            if len(sources) < 2:
                raise ValueError(f"{product_slug}/{color['slug']} needs two source photographs")
            first = ImageOps.fit(
                ImageOps.exif_transpose(Image.open(disk_path(sources[0]["path"]))).convert("RGB"),
                FULL_SIZE,
                method=Image.Resampling.LANCZOS,
            )
            second = ImageOps.fit(
                ImageOps.exif_transpose(Image.open(disk_path(sources[1]["path"]))).convert("RGB"),
                FULL_SIZE,
                method=Image.Resampling.LANCZOS,
            )
            color_dir = OUT_ROOT / product_slug / color["slug"]
            color_dir.mkdir(parents=True, exist_ok=True)
            images = []
            for index in range(FRAME_COUNT):
                frame = editorial_frame(first, second, index)
                full_name = f"angle-{index:02d}.webp"
                thumb_name = f"angle-{index:02d}-thumb.webp"
                full_path = color_dir / full_name
                thumb_path = color_dir / thumb_name
                frame.save(full_path, "WEBP", quality=82, method=5)
                frame.resize(THUMB_SIZE, Image.Resampling.LANCZOS).save(
                    thumb_path, "WEBP", quality=72, method=4
                )
                full_bytes = full_path.stat().st_size
                total_bytes += full_bytes + thumb_path.stat().st_size
                total_frames += 1
                images.append(
                    {
                        "path": f"/media/seed/spin/{product_slug}/{color['slug']}/{full_name}",
                        "thumbPath": f"/media/seed/spin/{product_slug}/{color['slug']}/{thumb_name}",
                        "width": FULL_SIZE[0],
                        "height": FULL_SIZE[1],
                        "bytes": full_bytes,
                    }
                )
            colors.append(
                {
                    "name": color["name"],
                    "slug": color["slug"],
                    "frameCount": FRAME_COUNT,
                    "source": "seed_derived",
                    "images": images,
                }
            )
        output_products[product_slug] = {"colors": colors}

    OUT_MANIFEST.write_text(
        json.dumps(
            {
                "version": 1,
                "note": "Derived editorial transition frames from the two existing catalogue photographs per colourway. Admin-uploaded true angle photographs replace these per variant.",
                "products": output_products,
            },
            indent=2,
        )
    )
    print(
        f"Generated {total_frames} WebP angle frames for "
        f"{len(output_products)} products ({total_bytes / 1024 / 1024:.1f} MB)."
    )
    print(f"Manifest: {OUT_MANIFEST}")


if __name__ == "__main__":
    main()
