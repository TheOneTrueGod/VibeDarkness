#!/usr/bin/env node
/**
 * Deploy script: run `npm run build`, then create deploy.zip with all files needed for production.
 * Usage: npm run deploy
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

/** Single files to include in the deploy archive (relative to project root). */
const DEPLOY_FILES = [
  'index.php',
  'composer.json',
  'composer.lock',
];

/** Directories to include in the deploy archive (relative to project root). */
const DEPLOY_DIRS = [
  'dist',
  'backend',
  'vendor',
];

/** Output zip filename (created in project root). */
const DEPLOY_ZIP_NAME = 'deploy.zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const zipPath = path.join(rootDir, DEPLOY_ZIP_NAME);

console.log('Deploy: building frontend...');
execSync('npm run build', {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log(`Deploy: creating ${DEPLOY_ZIP_NAME}...`);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

await new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);

  for (const name of DEPLOY_FILES) {
    const fullPath = path.join(rootDir, name);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name });
    }
  }
  for (const name of DEPLOY_DIRS) {
    const fullPath = path.join(rootDir, name);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      archive.directory(fullPath, name);
    }
  }

  archive.finalize();
});

console.log(`Done. Upload ${DEPLOY_ZIP_NAME} to the server, then run: unzip ${DEPLOY_ZIP_NAME}`);
