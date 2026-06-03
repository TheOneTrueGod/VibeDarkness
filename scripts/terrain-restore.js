#!/usr/bin/env node
/**
 * Restore a terrain segment JSON: renames storage/terrain-segments/<id>.json.bak
 * back to storage/terrain-segments/<id>.json.
 * Usage: npm run terrain-restore -- <segmentId>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const segmentId = process.argv[2];

if (!segmentId) {
    console.error('Usage: npm run terrain-restore -- <segmentId>');
    process.exit(1);
}

const dir = path.join(__dirname, '..', 'storage', 'terrain-segments');
const src = path.join(dir, `${segmentId}.json.bak`);
const dst = path.join(dir, `${segmentId}.json`);

if (!fs.existsSync(src)) {
    console.error(`Not found: ${src}`);
    process.exit(1);
}

fs.renameSync(src, dst);
console.log(`Restored: ${segmentId}.json.bak -> ${segmentId}.json`);
