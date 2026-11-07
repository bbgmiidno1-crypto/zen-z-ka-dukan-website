import fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import type { SeedManifest } from '../shared/types';
import { config } from './config';
import { getSeedManifest } from './manifest';

interface SeedColor {
  name: string;
  slug: string;
  hex: string;
}

interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  imageKey: string;
  sortOrder: number;
  specialFilter: 'new_arrival' | 'best_seller' | null;
}

interface SeedProduct {
  slug: string;
  name: string;
  categorySlug: string;
  imageKey: string;
  palette: string;
  description: string;
  pricePaise: number;
  originalPricePaise: number;
  sizes: string[];
  stockBase: number[];
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  available: boolean;
}

interface SeedCatalog {
  palettes: Record<string, SeedColor[]>;
  categories: SeedCategory[];
  products: SeedProduct[];
}

function seedStock(base: number, productIndex: number, colorIndex: number, sizeIndex: number): number {
  if (base === 0) return 0;
  const variation = (productIndex * 5 + colorIndex * 3 + sizeIndex * 7) % 5;
  return Math.max(0, base + variation - 2 - colorIndex * 2);
}

export function seedDatabase(db: Database): void {
  const counts = db
    .prepare('SELECT (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM products) AS products')
    .get() as { categories: number; products: number };
  if (counts.categories > 0 || counts.products > 0) return;

  const catalog = JSON.parse(fs.readFileSync(config.catalogSeedPath, 'utf8')) as SeedCatalog;
  const manifest: SeedManifest = getSeedManifest();
  const now = Date.now();

  const run = db.transaction(() => {
    const insertCategory = db.prepare(
      `INSERT INTO categories (name, slug, description, image_path, special_filter, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const categoryIds = new Map<string, number>();
    for (const category of catalog.categories) {
      const imagePath = manifest.categoryImages[category.imageKey] || manifest.editorial.campaign;
      const result = insertCategory.run(
        category.name,
        category.slug,
        category.description,
        imagePath,
        category.specialFilter,
        category.sortOrder,
        now,
        now,
      );
      categoryIds.set(category.slug, Number(result.lastInsertRowid));
    }

    const insertProduct = db.prepare(
      `INSERT INTO products
        (slug, name, description, category_id, price_paise, original_price_paise, discount_percent,
         available, featured, new_arrival, best_seller, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertVariant = db.prepare(
      `INSERT INTO product_variants (product_id, name, color_hex, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const insertSize = db.prepare(
      `INSERT INTO product_sizes (product_id, label, sort_order, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    const insertImage = db.prepare(
      `INSERT INTO product_images (product_id, variant_id, path, thumb_path, alt_text, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertInventory = db.prepare(
      `INSERT INTO variant_inventory (variant_id, size_id, stock) VALUES (?, ?, ?)`,
    );

    catalog.products.forEach((product, productIndex) => {
      const productCreatedAt = now + productIndex * 1000;
      const discountPercent = Math.round((1 - product.pricePaise / product.originalPricePaise) * 100);
      const result = insertProduct.run(
        product.slug,
        product.name,
        product.description,
        categoryIds.get(product.categorySlug) ?? null,
        product.pricePaise,
        product.originalPricePaise,
        discountPercent,
        product.available ? 1 : 0,
        product.featured ? 1 : 0,
        product.newArrival ? 1 : 0,
        product.bestSeller ? 1 : 0,
        productCreatedAt,
        productCreatedAt,
      );
      const productId = Number(result.lastInsertRowid);
      const sizeIds = product.sizes.map((label, sizeIndex) => {
        const inserted = insertSize.run(productId, label, sizeIndex, productCreatedAt);
        return Number(inserted.lastInsertRowid);
      });

      const colorEntries = manifest.products[product.slug]?.colors;
      if (!colorEntries?.length) {
        throw new Error(`Missing seeded colorway images for ${product.slug}. Run scripts/prepare_media.py.`);
      }
      colorEntries.forEach((color, colorIndex) => {
        const insertedVariant = insertVariant.run(productId, color.name, color.hex, colorIndex, productCreatedAt);
        const variantId = Number(insertedVariant.lastInsertRowid);
        color.images.forEach((image, imageIndex) => {
          insertImage.run(
            productId,
            variantId,
            image.path,
            image.thumbPath,
            `${product.name} — ${color.name}`,
            imageIndex,
            productCreatedAt,
          );
        });
        sizeIds.forEach((sizeId, sizeIndex) => {
          const base = product.stockBase[sizeIndex] ?? product.stockBase.at(-1) ?? 0;
          insertInventory.run(variantId, sizeId, seedStock(base, productIndex, colorIndex, sizeIndex));
        });
      });
    });
  });

  run.immediate();
  console.log(`[database] Seeded ${catalog.categories.length} categories and ${catalog.products.length} products with persistent media paths.`);
}
