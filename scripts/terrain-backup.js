#!/usr/bin/env node
/**
 * Back up a terrain segment JSON: renames storage/terrain-segments/<id>.json
 * to storage/terrain-segments/<id>.json.bak (deleting any existing .bak first).
 * Usage: npm run terrain-backup -- <segmentId>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const segmentId = process.argv[2];

if (!segmentId) {
    console.error('Usage: npm run terrain-backup -- <segmentId>');
    process.exit(1);
}

const dir = path.join(__dirname, '..', 'storage', 'terrain-segments');
const src = path.join(dir, `${segmentId}.json`);
const bak = path.join(dir, `${segmentId}.json.bak`);

if (!fs.existsSync(src)) {
    console.error(`Not found: ${src}`);
    process.exit(1);
}

if (fs.existsSync(bak)) {
    fs.rmSync(bak);
}

fs.renameSync(src, bak);
console.log(`Backed up: ${segmentId}.json -> ${segmentId}.json.bak`);
