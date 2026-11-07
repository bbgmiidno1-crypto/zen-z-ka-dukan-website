import fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import type { Product360FrameCount, Product360Source } from '../shared/types';
import { config } from './config';
import { slugify } from './crypto';

interface Seed360Image {
  path: string;
  thumbPath: string;
  width: number;
  height: number;
  bytes: number;
}

interface Seed360Color {
  name: string;
  slug: string;
  frameCount: Product360FrameCount;
  source: Product360Source;
  images: Seed360Image[];
}

interface Seed360Manifest {
  version: number;
  products: Record<string, { colors: Seed360Color[] }>;
}

interface VariantRow {
  id: number;
  product_id: number;
  slug: string;
  name: string;
}

/**
 * Adds a persistent 8-frame editorial angle sequence for every seeded colour
 * variant that does not already have one. It never updates or overwrites an
 * existing admin sequence, customer record, order or product image.
 */
export function seed360Sequences(database: Database): void {
  if (!fs.existsSync(config.seed360ManifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(config.seed360ManifestPath, 'utf8')) as Seed360Manifest;
  const variants = database.prepare(`
    SELECT pv.id, pv.product_id, p.slug, pv.name
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
    WHERE pv.deleted_at IS NULL
  `).all() as VariantRow[];
  if (!variants.length) return;

  const insertSequence = database.prepare(`
    INSERT INTO product_360_sequences
      (product_id, variant_id, frame_count, source, model_path, model_mime, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)
  `);
  const insertImage = database.prepare(`
    INSERT INTO product_360_images
      (sequence_id, path, thumb_path, position, width, height, bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const hasSequence = database.prepare(
    'SELECT id FROM product_360_sequences WHERE product_id = ? AND variant_id = ? LIMIT 1',
  );

  let created = 0;
  const now = Date.now();
  const run = database.transaction(() => {
    for (const variant of variants) {
      if (hasSequence.get(variant.product_id, variant.id)) continue;
      const colors = manifest.products[variant.slug]?.colors || [];
      const variantSlug = slugify(variant.name);
      const color = colors.find((entry) => entry.name.toLowerCase() === variant.name.toLowerCase())
        || colors.find((entry) => entry.slug === variantSlug);
      if (!color || !color.images.length) continue;
      const inserted = insertSequence.run(
        variant.product_id,
        variant.id,
        color.images.length,
        color.source,
        now,
        now,
      );
      const sequenceId = Number(inserted.lastInsertRowid);
      color.images.forEach((image, position) => {
        insertImage.run(
          sequenceId,
          image.path,
          image.thumbPath,
          position,
          image.width,
          image.height,
          image.bytes,
          now,
        );
      });
      created += 1;
    }
  });
  run.immediate();
  if (created > 0) {
    console.log(`[database] Linked ${created} persistent 360° editorial angle sequences without overwriting existing records.`);
  }
}
