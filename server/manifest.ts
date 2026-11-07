import fs from 'node:fs';
import type { SeedManifest } from '../shared/types';

import { config } from './config';

let cached: SeedManifest | null = null;

export function getSeedManifest(): SeedManifest {
  if (cached) return cached;
  if (!fs.existsSync(config.seedManifestPath)) {
    throw new Error(`Seed media manifest is missing: ${config.seedManifestPath}. Run: python3 scripts/prepare_media.py`);
  }
  const parsed = JSON.parse(fs.readFileSync(config.seedManifestPath, 'utf8')) as SeedManifest;
  if (!parsed.editorial?.hero || !parsed.categoryImages || !parsed.products) {
    throw new Error('Seed media manifest is incomplete. Run: python3 scripts/prepare_media.py');
  }
  cached = parsed;
  return parsed;
}
