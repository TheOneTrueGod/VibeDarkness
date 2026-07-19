#!/usr/bin/env node
/**
 * Lint only files changed in the working tree vs HEAD (tracked + untracked).
 * Used by agents after edits; full-tree lint remains `npm run lint` / `npm run ci`.
 *
 * Usage: npm run lint:changed
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/** Extensions ESLint in this repo is configured to handle. */
const LINTABLE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function gitLines(args) {
    const out = execSync(`git ${args}`, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function collectChangedPaths() {
    // ACMR = added, copied, modified, renamed — exclude deleted so we never pass missing paths.
    const tracked = gitLines('diff --name-only --diff-filter=ACMR HEAD');
    const untracked = gitLines('ls-files --others --exclude-standard');
    return [...new Set([...tracked, ...untracked])];
}

function isLintable(relPath) {
    const ext = path.extname(relPath).toLowerCase();
    if (!LINTABLE_EXT.has(ext)) return false;
    const abs = path.join(rootDir, relPath);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function main() {
    let paths;
    try {
        paths = collectChangedPaths().filter(isLintable);
    } catch (error) {
        console.error('[lint:changed] Failed to list git changes:', error);
        process.exit(1);
    }

    if (paths.length === 0) {
        console.log('[lint:changed] No lintable working-tree changes — skipping ESLint.');
        process.exit(0);
    }

    console.log(`[lint:changed] Linting ${paths.length} file(s):`);
    for (const p of paths) {
        console.log(`  ${p}`);
    }

    const result = spawnSync('npx', ['eslint', ...paths], {
        cwd: rootDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        stdio: 'inherit',
    });

    process.exit(result.status ?? 1);
}

main();
