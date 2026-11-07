#!/usr/bin/env python3
"""Create durable, optimized seed media for ZEN Z KA DUKAN.

All output is written to data/uploads/seed (a persistent workspace volume in this
environment). The generated manifest is read by the API seeder; no image is
embedded in the database and no remote URLs are used by the storefront.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "assets" / "generated"
EDITORIAL = ROOT / "assets" / "editorial"
UPLOADS = ROOT / "data" / "uploads"
SEED = UPLOADS / "seed"
CATALOG_PATH = ROOT / "shared" / "catalog-seed.json"
MANIFEST_PATH = ROOT / "data" / "seed-manifest.json"

PRODUCT_SIZE = (1000, 1250)
THUMB_SIZE = (560, 700)
CATEGORY_SIZE = (800, 1000)
WEBP_QUALITY = 82


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def load_image(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"Missing source image: {path}")
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def cinematic_crop(image: Image.Image, size: tuple[int, int], focus: float = 0.48) -> Image.Image:
    target_ratio = size[0] / size[1]
    width, height = image.size
    current_ratio = width / height
    if current_ratio > target_ratio:
        new_width = int(height * target_ratio)
        offset = int((width - new_width) * focus)
        box = (offset, 0, offset + new_width, height)
    else:
        new_height = int(width / target_ratio)
        offset = int((height - new_height) * focus)
        box = (0, offset, width, offset + new_height)
    return image.crop(box).resize(size, Image.Resampling.LANCZOS)


def apply_variant_grade(image: Image.Image, color_hex: str, variant_index: int, view_index: int) -> Image.Image:
    """Create a visibly distinct colorway while preserving photographic detail."""
    size = image.size
    color = hex_rgb(color_hex)
    luminance = ImageOps.grayscale(image)
    # Affect midtones/highlights more than the deep-black background.
    mask = luminance.point(lambda p: max(0, min(165, int((p - 32) * 1.8))))
    tint_strength = 0.34 + min(variant_index, 2) * 0.06
    tinted = Image.blend(image, Image.new("RGB", size, color), tint_strength)
    out = Image.composite(tinted, image, mask)
    # Subtle house grade: crushed blacks, gentle contrast, warm/cool bias.
    out = Image.blend(out, Image.new("RGB", size, (7, 7, 7)), 0.055)
    bias = tuple(max(0, min(255, int(c * 0.12))) for c in color)
    channel_bias = Image.new("RGB", size, (8 + bias[0], 8 + bias[1], 8 + bias[2]))
    out = Image.blend(out, channel_bias, 0.035)
    out = ImageEnhance.Color(out).enhance(1.03 + variant_index * 0.04)
    out = ImageEnhance.Contrast(out).enhance(1.07)
    out = ImageEnhance.Brightness(out).enhance(0.97 + view_index * 0.025 + variant_index * 0.012)
    return out.filter(ImageFilter.UnsharpMask(radius=0.7, percent=55, threshold=3))


def soft_vignette(image: Image.Image, strength: float = 0.26) -> Image.Image:
    width, height = image.size
    mask = Image.new("L", (width, height), 0)
    pixels = mask.load()
    cx, cy = width / 2, height / 2
    max_dist = math.hypot(cx, cy)
    for y in range(0, height, 4):
        for x in range(0, width, 4):
            distance = math.hypot(x - cx, y - cy) / max_dist
            value = int(255 * max(0.0, 1.0 - (distance ** 2) * strength))
            for yy in range(y, min(y + 4, height)):
                for xx in range(x, min(x + 4, width)):
                    pixels[xx, yy] = value
    dark = ImageEnhance.Brightness(image).enhance(0.55)
    return Image.composite(image, dark, mask)


def save_webp(image: Image.Image, path: Path, quality: int = WEBP_QUALITY) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=5)


def media_url(path: Path) -> str:
    return "/media/" + path.relative_to(UPLOADS).as_posix()


def source_for_product(product: dict, view_index: int) -> Path:
    key = product["imageKey"]
    if view_index == 0:
        return GENERATED / f"{key}.jpg"
    generated_alt = GENERATED / f"{key}-alt.jpg"
    if generated_alt.exists():
        return generated_alt
    fallbacks = {
        "men": "editorial-10.jpg",
        "women": "editorial-08.jpg",
        "kids": "editorial-09.jpg",
        "shoes": "editorial-05.jpg",
        "bag": "editorial-03.jpg",
        "beauty": "editorial-04.jpg",
        "accessories": "editorial-06.jpg",
    }
    # A crop of the generated primary image is preferred to an unrelated photo
    # when no matching alternate campaign image exists.
    fallback = EDITORIAL / fallbacks[key]
    if fallback.exists() and view_index == 1 and product.get("useEditorialFallback", True):
        return fallback
    return GENERATED / f"{key}.jpg"


def build_product_media(catalog: dict) -> dict:
    product_manifest: dict[str, dict] = {}
    total = len(catalog["products"])
    for product_index, product in enumerate(catalog["products"], 1):
        slug = product["slug"]
        colors = catalog["palettes"][product["palette"]]
        color_entries = []
        for color_index, color in enumerate(colors):
            images = []
            for view_index in range(2):
                source = source_for_product(product, view_index)
                raw = load_image(source)
                focus = 0.46 if view_index == 0 else 0.58 + (color_index * 0.03)
                cropped = cinematic_crop(raw, PRODUCT_SIZE, min(0.78, focus))
                graded = apply_variant_grade(cropped, color["hex"], color_index, view_index)
                out = SEED / "products" / slug / f"{color['slug']}-{view_index + 1}.webp"
                thumb = SEED / "products" / slug / f"{color['slug']}-{view_index + 1}-thumb.webp"
                save_webp(graded, out)
                save_webp(graded.resize(THUMB_SIZE, Image.Resampling.LANCZOS), thumb, 78)
                images.append({"path": media_url(out), "thumbPath": media_url(thumb)})
            color_entries.append(
                {"name": color["name"], "slug": color["slug"], "hex": color["hex"], "images": images}
            )
        product_manifest[slug] = {"colors": color_entries}
        if product_index % 4 == 0 or product_index == total:
            print(f"Prepared product media {product_index}/{total}")
    return product_manifest


def build_category_media(catalog: dict) -> dict[str, str]:
    mapping: dict[str, str] = {}
    keys = sorted({category["imageKey"] for category in catalog["categories"]})
    for key in keys:
        source = GENERATED / f"{key}.jpg"
        image = cinematic_crop(load_image(source), CATEGORY_SIZE, 0.5)
        image = soft_vignette(image, 0.22)
        out = SEED / "categories" / f"{key}.webp"
        save_webp(image, out)
        mapping[key] = media_url(out)
    return mapping


def build_editorial_media() -> dict[str, str]:
    jobs = {
        "hero": (GENERATED / "hero.jpg", (1800, 1000), 0.5, 0.12),
        "heroPoster": (GENERATED / "women.jpg", (900, 1200), 0.47, 0.3),
        "campaign": (EDITORIAL / "editorial-01.jpg", (1200, 1500), 0.5, 0.34),
        "collectionOne": (GENERATED / "men.jpg", (1100, 1400), 0.5, 0.28),
        "collectionTwo": (GENERATED / "accessories.jpg", (1100, 1400), 0.52, 0.26),
        "promotion": (GENERATED / "beauty.jpg", (1500, 900), 0.5, 0.2),
        "quote": (EDITORIAL / "editorial-02.jpg", (1000, 1250), 0.5, 0.32),
    }
    result: dict[str, str] = {}
    for key, (source, size, focus, vignette) in jobs.items():
        image = cinematic_crop(load_image(source), size, focus)
        # Editorial images get the house's warm gold cast without becoming flat.
        image = Image.blend(image, Image.new("RGB", size, (26, 19, 8)), 0.055)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        image = soft_vignette(image, vignette)
        out = SEED / "editorial" / f"{key}.webp"
        save_webp(image, out, 84)
        result[key] = media_url(out)
    return result


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    UPLOADS.mkdir(parents=True, exist_ok=True)
    print("Preparing editorial media...")
    editorial = build_editorial_media()
    print("Preparing category media...")
    category_images = build_category_media(catalog)
    print("Preparing product colorway media...")
    products = build_product_media(catalog)
    manifest = {"editorial": editorial, "categoryImages": category_images, "products": products}
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    file_count = sum(1 for _ in SEED.rglob("*.webp"))
    size_mb = sum(p.stat().st_size for p in SEED.rglob("*.webp")) / 1024 / 1024
    print(f"Wrote {file_count} optimized WebP images ({size_mb:.1f} MB) and {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
