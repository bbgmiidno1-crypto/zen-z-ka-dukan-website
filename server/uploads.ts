import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { config } from './config';
import { HttpError } from './http';

const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const allowedModelMimes = new Set([
  'model/gltf-binary',
  'model/gltf+json',
  'application/octet-stream',
  'application/json',
]);
const spinModelField = /^spinModels_(\d+)$/;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: config.maxUploadFiles,
    fields: 80,
    fieldSize: 2 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (spinModelField.test(file.fieldname)) {
      if (!allowedModelMimes.has(file.mimetype)) {
        callback(new HttpError(415, 'Only GLB or glTF 3D model files are accepted.', 'unsupported_model'));
        return;
      }
      callback(null, true);
      return;
    }
    if (!allowedMimes.has(file.mimetype)) {
      callback(new HttpError(415, 'Only JPEG, PNG, WebP and AVIF image files are accepted.', 'unsupported_image'));
      return;
    }
    callback(null, true);
  },
});

function hasValidSignature(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mime === 'image/avif') {
    const header = buffer.subarray(0, 16).toString('ascii');
    return header.includes('ftypavif') || header.includes('ftypavis');
  }
  return false;
}

function toMediaUrl(filePath: string): string {
  const relative = path.relative(config.uploadDir, filePath).split(path.sep).join('/');
  return `/media/${relative}`;
}

function mediaRoots(): string[] {
  return [path.resolve(config.uploadDir), path.resolve(config.seedUploadDir)];
}

function safeAbsoluteFromMediaUrl(url: string): string | null {
  if (!url.startsWith('/media/')) return null;
  const relative = url.slice('/media/'.length);
  for (const root of mediaRoots()) {
    const absolute = path.resolve(root, relative);
    if (absolute.startsWith(root + path.sep) && fsSync.existsSync(absolute)) return absolute;
  }
  const primary = path.resolve(config.uploadDir, relative);
  return primary.startsWith(path.resolve(config.uploadDir) + path.sep) ? primary : null;
}

export function resolveMediaAbsolute(url: string): string | null {
  return safeAbsoluteFromMediaUrl(url);
}

export interface StoredImage {
  path: string;
  thumbPath: string;
  absolutePaths: string[];
  width: number;
  height: number;
  bytes: number;
}

export interface StoredModel {
  path: string;
  absolutePath: string;
  mime: 'model/gltf-binary' | 'model/gltf+json';
}

export type ImageProfile = 'standard' | 'spin';

const IMAGE_PROFILES: Record<ImageProfile, {
  width: number;
  height: number;
  quality: number;
  thumbWidth: number;
  thumbHeight: number;
  thumbQuality: number;
}> = {
  standard: { width: 1200, height: 1500, quality: 84, thumbWidth: 600, thumbHeight: 750, thumbQuality: 78 },
  spin: { width: 1600, height: 2000, quality: 88, thumbWidth: 600, thumbHeight: 750, thumbQuality: 78 },
};

export async function saveOptimizedImage(
  file: Express.Multer.File,
  folder: string,
  label: string,
  profile: ImageProfile = 'standard',
): Promise<StoredImage> {
  if (!allowedMimes.has(file.mimetype) || !hasValidSignature(file.buffer, file.mimetype)) {
    throw new HttpError(415, 'The uploaded file is not a valid image.', 'unsupported_image');
  }
  let normalized: sharp.Sharp;
  try {
    const pipeline = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error('Missing image metadata');
    }
    const detected = metadata.format;
    const expectedFormats: Record<string, string[]> = {
      'image/jpeg': ['jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
      'image/avif': ['avif', 'heif'],
    };
    if (!expectedFormats[file.mimetype]?.includes(detected)) {
      throw new Error('Detected image format does not match the declared type');
    }
    normalized = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();
  } catch {
    throw new HttpError(415, 'The uploaded image could not be decoded. Please export a valid photo.', 'invalid_image');
  }

  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\.\./g, '');
  const safeLabel = label.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 48) || 'image';
  const unique = `${safeLabel}-${crypto.randomBytes(7).toString('hex')}`;
  const outputDir = path.join(config.uploadDir, safeFolder);
  await fs.mkdir(outputDir, { recursive: true });
  const fullPath = path.join(outputDir, `${unique}.webp`);
  const thumbPath = path.join(outputDir, `${unique}-thumb.webp`);
  const settings = IMAGE_PROFILES[profile];

  try {
    const full = await normalized
      .clone()
      .resize({ width: settings.width, height: settings.height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: settings.quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await normalized
      .clone()
      .resize({ width: settings.thumbWidth, height: settings.thumbHeight, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: settings.thumbQuality, effort: 4 })
      .toBuffer();
    await fs.writeFile(fullPath, full.data, { mode: 0o644 });
    await fs.writeFile(thumbPath, thumb, { mode: 0o644 });
    return {
      path: toMediaUrl(fullPath),
      thumbPath: toMediaUrl(thumbPath),
      absolutePaths: [fullPath, thumbPath],
      width: full.info.width,
      height: full.info.height,
      bytes: full.data.length,
    };
  } catch (error) {
    await Promise.allSettled([fs.unlink(fullPath), fs.unlink(thumbPath)]);
    throw new HttpError(500, 'The image could not be optimized and stored.', 'image_storage_failed', error);
  }
}

export async function saveModelFile(file: Express.Multer.File, label = 'model'): Promise<StoredModel> {
  if (!spinModelField.test(file.fieldname)) {
    throw new HttpError(400, 'A 3D model was attached to an unknown colour variant.', 'invalid_upload_field');
  }
  if (file.size > config.maxModelBytes) {
    throw new HttpError(413, 'The 3D model is too large.', 'model_too_large');
  }
  const looksBinary = file.buffer.subarray(0, 4).toString('ascii') === 'glTF';
  let extension: 'glb' | 'gltf';
  let mime: StoredModel['mime'];
  if (looksBinary) {
    if (file.buffer.length < 20 || file.buffer.readUInt32LE(8) > file.buffer.length) {
      throw new HttpError(415, 'The GLB model header is invalid.', 'invalid_model');
    }
    extension = 'glb';
    mime = 'model/gltf-binary';
  } else {
    try {
      const parsed = JSON.parse(file.buffer.toString('utf8')) as { asset?: { version?: string } };
      if (!parsed.asset?.version?.startsWith('2.')) throw new Error('Not glTF 2.0');
    } catch {
      throw new HttpError(415, 'The glTF model is not valid JSON glTF 2.0.', 'invalid_model');
    }
    extension = 'gltf';
    mime = 'model/gltf+json';
  }

  const safeLabel = label.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 48) || 'model';
  const unique = `${safeLabel}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
  const outputDir = config.modelUploadDir;
  await fs.mkdir(outputDir, { recursive: true });
  const absolutePath = path.join(outputDir, unique);
  try {
    await fs.writeFile(absolutePath, file.buffer, { mode: 0o644 });
  } catch (error) {
    await fs.unlink(absolutePath).catch(() => undefined);
    throw new HttpError(500, 'The 3D model could not be stored.', 'model_storage_failed', error);
  }
  return { path: toMediaUrl(absolutePath), absolutePath, mime };
}

export async function deleteStoredImages(paths: string[]): Promise<void> {
  await Promise.allSettled(
    paths.map(async (url) => {
      const absolute = safeAbsoluteFromMediaUrl(url);
      if (absolute) await fs.unlink(absolute);
    }),
  );
}

export interface ProductUploadGroups {
  variantImages: Map<number, Express.Multer.File[]>;
  spinImages: Map<number, Express.Multer.File[]>;
  spinModels: Map<number, Express.Multer.File>;
}

export function extractProductUploads(files: Express.Multer.File[]): ProductUploadGroups {
  const result: ProductUploadGroups = {
    variantImages: new Map(),
    spinImages: new Map(),
    spinModels: new Map(),
  };
  for (const file of files) {
    const variantMatch = /^variantImages_(\d+)$/.exec(file.fieldname);
    if (variantMatch) {
      const index = Number(variantMatch[1]);
      const bucket = result.variantImages.get(index) || [];
      bucket.push(file);
      result.variantImages.set(index, bucket);
      continue;
    }
    const spinMatch = /^spinImages_(\d+)$/.exec(file.fieldname);
    if (spinMatch) {
      const index = Number(spinMatch[1]);
      const bucket = result.spinImages.get(index) || [];
      bucket.push(file);
      result.spinImages.set(index, bucket);
      continue;
    }
    const modelMatch = spinModelField.exec(file.fieldname);
    if (modelMatch) {
      const index = Number(modelMatch[1]);
      if (result.spinModels.has(index)) {
        throw new HttpError(400, 'Upload only one 3D model per colour variant.', 'duplicate_model');
      }
      result.spinModels.set(index, file);
      continue;
    }
    throw new HttpError(400, 'An uploaded file was attached to an unknown field.', 'invalid_upload_field');
  }
  return result;
}

export function extractFileGroups(files: Express.Multer.File[]): Map<number, Express.Multer.File[]> {
  return extractProductUploads(files).variantImages;
}
