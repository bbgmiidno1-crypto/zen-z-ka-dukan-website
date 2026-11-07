import crypto from 'node:crypto';
import type { z } from 'zod';
import type { ProductImage } from '../shared/types';
import { slugify } from './crypto';
import { db } from './db';
import { HttpError } from './http';
import { getAdminProductDetail } from './serializers';
import {
  deleteStoredImages,
  extractProductUploads,
  saveModelFile,
  saveOptimizedImage,
  type StoredImage,
  type StoredModel,
} from './uploads';
import type { productFormSchema } from './validation';

type ProductInput = z.infer<typeof productFormSchema>;
type Row = Record<string, unknown>;

const SPIN_FRAME_COUNTS = [8, 12, 16, 24, 36] as const;

interface PreparedUploads {
  variantImages: Map<number, StoredImage[]>;
  spinImages: Map<number, StoredImage[]>;
  spinModels: Map<number, StoredModel>;
  allMediaUrls: string[];
}

interface SpinSyncState {
  warnings: string[];
  obsoleteUrls: string[];
  unusedUrls: string[];
}

export function uniqueSlug(table: 'products' | 'categories', base: string, excludeId?: number): string {
  const statement = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = statement.get(candidate) as Row | undefined;
    if (!existing || (excludeId && Number(existing.id) === excludeId)) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function pushImageUrls(target: string[], image: { path: string; thumbPath: string }): void {
  target.push(image.path, image.thumbPath);
}

async function prepareProductUploads(files: Express.Multer.File[], variantCount: number): Promise<PreparedUploads> {
  const groups = extractProductUploads(files);
  const result: PreparedUploads = {
    variantImages: new Map(),
    spinImages: new Map(),
    spinModels: new Map(),
    allMediaUrls: [],
  };
  const variantFolder = `products/${crypto.randomUUID()}`;
  const spinFolder = `spin/admin/${crypto.randomUUID()}`;

  try {
    for (const [index, group] of groups.variantImages) {
      if (index < 0 || index >= variantCount) {
        throw new HttpError(400, 'An image was uploaded for a colour variant that does not exist.', 'invalid_variant_images');
      }
      const bucket: StoredImage[] = [];
      for (const file of group) {
        const stored = await saveOptimizedImage(file, variantFolder, `variant-${index + 1}`);
        bucket.push(stored);
        pushImageUrls(result.allMediaUrls, stored);
      }
      result.variantImages.set(index, bucket);
    }

    for (const [index, group] of groups.spinImages) {
      if (index < 0 || index >= variantCount) {
        throw new HttpError(400, 'A 360° image was uploaded for a colour variant that does not exist.', 'invalid_variant_images');
      }
      if (group.length > 36) {
        throw new HttpError(400, 'A 360° sequence can contain at most 36 angles.', 'too_many_spin_images');
      }
      const bucket: StoredImage[] = [];
      for (const [position, file] of group.entries()) {
        const stored = await saveOptimizedImage(file, spinFolder, `angle-${index + 1}-${position + 1}`, 'spin');
        bucket.push(stored);
        pushImageUrls(result.allMediaUrls, stored);
      }
      result.spinImages.set(index, bucket);
    }

    for (const [index, file] of groups.spinModels) {
      if (index < 0 || index >= variantCount) {
        throw new HttpError(400, 'A 3D model was uploaded for a colour variant that does not exist.', 'invalid_variant_images');
      }
      const stored = await saveModelFile(file, `variant-${index + 1}`);
      result.spinModels.set(index, stored);
      result.allMediaUrls.push(stored.path);
    }
    return result;
  } catch (error) {
    await deleteStoredImages(result.allMediaUrls);
    throw error;
  }
}

function assertImages(payload: ProductInput, imagesByVariant: Map<number, StoredImage[]>): void {
  payload.variants.forEach((variant, index) => {
    const newCount = imagesByVariant.get(index)?.length || 0;
    if (variant.existingImages.length + newCount === 0) {
      throw new HttpError(400, `Upload at least one image for ${variant.name}.`, 'variant_image_required');
    }
    if (variant.existingImages.length + newCount > 8) {
      throw new HttpError(400, 'A colour variant can have at most 8 images.', 'too_many_images');
    }
  });
}

function assertCategory(categoryId: number | null): void {
  if (categoryId == null) return;
  const category = db.prepare('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL').get(categoryId);
  if (!category) throw new HttpError(400, 'Choose an active category.', 'invalid_category');
}

function syncSizes(productId: number, payload: ProductInput, now: number): number[] {
  const active = db.prepare('SELECT id FROM product_sizes WHERE product_id = ? AND deleted_at IS NULL').all(productId) as Row[];
  const keep = new Set(payload.sizes.filter((size) => size.id).map((size) => Number(size.id)));
  for (const row of active) {
    if (!keep.has(Number(row.id))) {
      db.prepare('UPDATE product_sizes SET deleted_at = ? WHERE id = ?').run(now, Number(row.id));
    }
  }
  return payload.sizes.map((size, index) => {
    if (size.id) {
      const owned = db
        .prepare('SELECT id FROM product_sizes WHERE id = ? AND product_id = ? AND deleted_at IS NULL')
        .get(size.id, productId);
      if (!owned) throw new HttpError(400, 'A saved size no longer belongs to this product.', 'invalid_size');
      db.prepare('UPDATE product_sizes SET label = ?, sort_order = ? WHERE id = ?').run(size.label, index, size.id);
      return Number(size.id);
    }
    const inserted = db
      .prepare('INSERT INTO product_sizes (product_id, label, sort_order, created_at) VALUES (?, ?, ?, ?)')
      .run(productId, size.label, index, now);
    return Number(inserted.lastInsertRowid);
  });
}

function syncVariantImages(
  productId: number,
  variantId: number,
  existingImages: ProductInput['variants'][number]['existingImages'],
  newImages: StoredImage[],
  now: number,
): void {
  const verified: Array<Pick<ProductImage, 'id' | 'path' | 'thumbPath'>> = [];
  const seen = new Set<number>();
  for (const image of existingImages) {
    if (seen.has(image.id)) throw new HttpError(400, 'The same product image was selected twice.', 'duplicate_image');
    seen.add(image.id);
    const row = db
      .prepare(
        `SELECT id, path, thumb_path FROM product_images
         WHERE id = ? AND product_id = ? AND variant_id = ? AND deleted_at IS NULL`,
      )
      .get(image.id, productId, variantId) as Row | undefined;
    if (!row) throw new HttpError(400, 'A selected image no longer belongs to this colour variant.', 'invalid_image_reference');
    verified.push({ id: Number(row.id), path: String(row.path), thumbPath: String(row.thumb_path) });
  }
  const active = db
    .prepare('SELECT id FROM product_images WHERE product_id = ? AND variant_id = ? AND deleted_at IS NULL')
    .all(productId, variantId) as Row[];
  for (const row of active) {
    if (!seen.has(Number(row.id))) {
      db.prepare('UPDATE product_images SET deleted_at = ? WHERE id = ?').run(now, Number(row.id));
    }
  }
  verified.forEach((image, index) => {
    db.prepare('UPDATE product_images SET sort_order = ? WHERE id = ?').run(index, image.id);
  });
  newImages.forEach((image, index) => {
    db.prepare(`
      INSERT INTO product_images (product_id, variant_id, path, thumb_path, alt_text, sort_order, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `).run(productId, variantId, image.path, image.thumbPath, verified.length + index, now);
  });
}

function syncVariants(
  productId: number,
  payload: ProductInput,
  sizeIds: number[],
  variantImages: Map<number, StoredImage[]>,
  now: number,
): number[] {
  const active = db.prepare('SELECT id FROM product_variants WHERE product_id = ? AND deleted_at IS NULL').all(productId) as Row[];
  const keep = new Set(payload.variants.filter((variant) => variant.id).map((variant) => Number(variant.id)));
  for (const row of active) {
    if (!keep.has(Number(row.id))) {
      const id = Number(row.id);
      db.prepare('UPDATE product_variants SET deleted_at = ? WHERE id = ?').run(now, id);
      db.prepare('UPDATE product_images SET deleted_at = ? WHERE variant_id = ? AND deleted_at IS NULL').run(now, id);
      db.prepare('UPDATE product_360_images SET deleted_at = ? WHERE sequence_id IN (SELECT id FROM product_360_sequences WHERE variant_id = ?)').run(now, id);
      db.prepare('UPDATE product_360_sequences SET deleted_at = ?, updated_at = ? WHERE variant_id = ? AND deleted_at IS NULL').run(now, now, id);
    }
  }
  const upsertInventory = db.prepare(`
    INSERT INTO variant_inventory (variant_id, size_id, stock) VALUES (?, ?, ?)
    ON CONFLICT(variant_id, size_id) DO UPDATE SET stock = excluded.stock
  `);
  const variantIds: number[] = [];
  payload.variants.forEach((variant, index) => {
    let variantId: number;
    if (variant.id) {
      const owned = db
        .prepare('SELECT id FROM product_variants WHERE id = ? AND product_id = ? AND deleted_at IS NULL')
        .get(variant.id, productId);
      if (!owned) throw new HttpError(400, 'A saved colour variant no longer belongs to this product.', 'invalid_variant');
      variantId = Number(variant.id);
      db.prepare('UPDATE product_variants SET name = ?, color_hex = ?, sort_order = ? WHERE id = ?').run(
        variant.name,
        variant.colorHex,
        index,
        variantId,
      );
    } else {
      const inserted = db
        .prepare('INSERT INTO product_variants (product_id, name, color_hex, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(productId, variant.name, variant.colorHex, index, now);
      variantId = Number(inserted.lastInsertRowid);
    }
    variantIds.push(variantId);
    syncVariantImages(productId, variantId, variant.existingImages, variantImages.get(index) || [], now);
    sizeIds.forEach((sizeId, sizeIndex) => upsertInventory.run(variantId, sizeId, variant.stock[sizeIndex]));
  });
  return variantIds;
}

function syncSpinSequences(
  productId: number,
  variantIds: number[],
  payload: ProductInput,
  spinImages: Map<number, StoredImage[]>,
  spinModels: Map<number, StoredModel>,
  now: number,
  state: SpinSyncState,
): void {
  payload.variants.forEach((variant, index) => {
    const spin = variant.spin;
    if (!spin) return;
    const variantId = variantIds[index];
    if (!variantId) return;
    const newImages = spinImages.get(index) || [];
    const newModel = spinModels.get(index);
    const desiredExisting = spin.existingImages;
    const total = desiredExisting.length + newImages.length;

    const markUnused = () => {
      newImages.forEach((image) => pushImageUrls(state.unusedUrls, image));
      if (newModel) state.unusedUrls.push(newModel.path);
    };

    const sequenceRow = db
      .prepare('SELECT * FROM product_360_sequences WHERE product_id = ? AND variant_id = ? ORDER BY id DESC LIMIT 1')
      .get(productId, variantId) as Row | undefined;
    const activeSequence = sequenceRow && sequenceRow.deleted_at == null ? sequenceRow : null;

    if (spin.clearSequence && total === 0) {
      if (activeSequence) {
        const oldImages = db
          .prepare('SELECT * FROM product_360_images WHERE sequence_id = ? AND deleted_at IS NULL')
          .all(Number(activeSequence.id)) as Row[];
        oldImages.forEach((image) => state.obsoleteUrls.push(String(image.path), String(image.thumb_path)));
        if (activeSequence.model_path) state.obsoleteUrls.push(String(activeSequence.model_path));
        db.prepare('UPDATE product_360_images SET deleted_at = ? WHERE sequence_id = ? AND deleted_at IS NULL').run(now, Number(activeSequence.id));
        db.prepare('UPDATE product_360_sequences SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, Number(activeSequence.id));
      }
      markUnused();
      return;
    }

    if (total === 0) {
      state.warnings.push(`${variant.name}: the 360° viewer requires at least ${spin.frameCount} angle images. The normal product was saved.`);
      markUnused();
      return;
    }
    if (!SPIN_FRAME_COUNTS.includes(total as (typeof SPIN_FRAME_COUNTS)[number])) {
      state.warnings.push(`${variant.name}: use exactly 8, 12, 16, 24 or 36 angles. Received ${total}; the 360° sequence was not changed.`);
      markUnused();
      return;
    }

    const activeImageRows = activeSequence
      ? db.prepare('SELECT * FROM product_360_images WHERE sequence_id = ? AND deleted_at IS NULL').all(Number(activeSequence.id)) as Row[]
      : [];
    const activeById = new Map(activeImageRows.map((row) => [Number(row.id), row]));
    const seen = new Set<number>();
    for (const image of desiredExisting) {
      if (seen.has(image.id)) throw new HttpError(400, 'The same 360° image was selected twice.', 'duplicate_spin_image');
      const row = activeById.get(image.id);
      if (!row) throw new HttpError(400, 'A selected 360° image no longer belongs to this colour variant.', 'invalid_spin_image_reference');
      seen.add(image.id);
    }

    let modelPath = activeSequence?.model_path ? String(activeSequence.model_path) : null;
    let modelMime = activeSequence?.model_mime ? String(activeSequence.model_mime) : null;
    if (spin.removeModel && modelPath) {
      state.obsoleteUrls.push(modelPath);
      modelPath = null;
      modelMime = null;
    }
    if (newModel) {
      if (modelPath) state.obsoleteUrls.push(modelPath);
      modelPath = newModel.path;
      modelMime = newModel.mime;
    }

    const source = newImages.length > 0 || newModel ? 'admin_upload' : (activeSequence?.source ? String(activeSequence.source) : 'admin_upload');
    let sequenceId: number;
    if (sequenceRow) {
      sequenceId = Number(sequenceRow.id);
      db.prepare(`
        UPDATE product_360_sequences
        SET frame_count = ?, source = ?, model_path = ?, model_mime = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `).run(total, source, modelPath, modelMime, now, sequenceId);
    } else {
      const inserted = db.prepare(`
        INSERT INTO product_360_sequences
          (product_id, variant_id, frame_count, source, model_path, model_mime, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(productId, variantId, total, source, modelPath, modelMime, now, now);
      sequenceId = Number(inserted.lastInsertRowid);
    }

    for (const row of activeImageRows) {
      if (!seen.has(Number(row.id))) {
        state.obsoleteUrls.push(String(row.path), String(row.thumb_path));
        db.prepare('UPDATE product_360_images SET deleted_at = ? WHERE id = ?').run(now, Number(row.id));
      }
    }
    desiredExisting.forEach((image, position) => {
      db.prepare('UPDATE product_360_images SET position = ?, deleted_at = NULL WHERE id = ?').run(position, image.id);
    });
    newImages.forEach((image, offset) => {
      db.prepare(`
        INSERT INTO product_360_images
          (sequence_id, path, thumb_path, position, width, height, bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sequenceId,
        image.path,
        image.thumbPath,
        desiredExisting.length + offset,
        image.width,
        image.height,
        image.bytes,
        now,
      );
    });
  });
}

export async function persistProduct(payload: ProductInput, files: Express.Multer.File[], productId?: number) {
  const prepared = await prepareProductUploads(files, payload.variants.length);
  assertImages(payload, prepared.variantImages);
  assertCategory(payload.categoryId);
  const state: SpinSyncState = { warnings: [], obsoleteUrls: [], unusedUrls: [] };

  try {
    const run = db.transaction(() => {
      const now = Date.now();
      const slug = uniqueSlug('products', payload.slug || slugify(payload.name), productId);
      const discountPercent = Math.round((1 - payload.pricePaise / payload.originalPricePaise) * 100);
      let id = productId;
      if (id) {
        const existing = db.prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL').get(id);
        if (!existing) throw new HttpError(404, 'Product not found.', 'product_not_found');
        db.prepare(`
          UPDATE products SET slug = ?, name = ?, description = ?, category_id = ?, price_paise = ?,
            original_price_paise = ?, discount_percent = ?, available = ?, featured = ?, new_arrival = ?,
            best_seller = ?, updated_at = ?
          WHERE id = ?
        `).run(
          slug,
          payload.name,
          payload.description,
          payload.categoryId,
          payload.pricePaise,
          payload.originalPricePaise,
          discountPercent,
          payload.available ? 1 : 0,
          payload.featured ? 1 : 0,
          payload.newArrival ? 1 : 0,
          payload.bestSeller ? 1 : 0,
          now,
          id,
        );
      } else {
        const inserted = db.prepare(`
          INSERT INTO products
            (slug, name, description, category_id, price_paise, original_price_paise, discount_percent,
             available, featured, new_arrival, best_seller, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          slug,
          payload.name,
          payload.description,
          payload.categoryId,
          payload.pricePaise,
          payload.originalPricePaise,
          discountPercent,
          payload.available ? 1 : 0,
          payload.featured ? 1 : 0,
          payload.newArrival ? 1 : 0,
          payload.bestSeller ? 1 : 0,
          now,
          now,
        );
        id = Number(inserted.lastInsertRowid);
      }
      const sizeIds = syncSizes(id, payload, now);
      const variantIds = syncVariants(id, payload, sizeIds, prepared.variantImages, now);
      syncSpinSequences(id, variantIds, payload, prepared.spinImages, prepared.spinModels, now, state);
      return id;
    });
    const savedId = run.immediate();
    await deleteStoredImages([...state.obsoleteUrls, ...state.unusedUrls]);
    return { product: getAdminProductDetail(savedId), warnings: state.warnings };
  } catch (error) {
    await deleteStoredImages(prepared.allMediaUrls);
    throw error;
  }
}

export function softDeleteProduct(productId: number): void {
  const now = Date.now();
  const result = db
    .prepare('UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(now, now, productId);
  if (result.changes !== 1) throw new HttpError(404, 'Product not found.', 'product_not_found');
  // Close 360° records with the product so no orphaned sequence stays active. Media files are kept
  // on disk because order history snapshots may still reference the product photography.
  db.prepare('UPDATE product_360_images SET deleted_at = ? WHERE sequence_id IN (SELECT id FROM product_360_sequences WHERE product_id = ?) AND deleted_at IS NULL').run(now, productId);
  db.prepare('UPDATE product_360_sequences SET deleted_at = ?, updated_at = ? WHERE product_id = ? AND deleted_at IS NULL').run(now, now, productId);
}
