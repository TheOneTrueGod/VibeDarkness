/**
 * Shared Playwright paths + allowed origins (imported by config and fixtures).
 * Keep artifacts under tmp/playwright so agents never write outside the repo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PLAYWRIGHT_TMP_DIR = path.join(rootDir, 'tmp', 'playwright');
export const PLAYWRIGHT_DOWNLOADS_DIR = path.join(PLAYWRIGHT_TMP_DIR, 'downloads');
export const PLAYWRIGHT_OUTPUT_DIR = path.join(PLAYWRIGHT_TMP_DIR, 'test-results');
export const PLAYWRIGHT_REPORT_DIR = path.join(PLAYWRIGHT_TMP_DIR, 'report');
export const PLAYWRIGHT_TRACE_DIR = path.join(PLAYWRIGHT_TMP_DIR, 'traces');

/** Origins the sandboxed browser may contact (Vite UI + PHP API). */
export const PLAYWRIGHT_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
] as const;

export const PLAYWRIGHT_DEFAULT_BASE_URL = 'http://localhost:5173';
