#!/usr/bin/env node
/**
 * Local continuous integration loop.
 *
 * Usage: npm run ci
 *
 * Runs lint, Vitest, and TypeScript checks immediately, writes results to
 * storage/ci_results.json, sleeps 30 minutes, then repeats. When the git tree
 * fingerprint matches the last completed run, checks are skipped and only
 * nextScheduledAt is advanced.
 */

import { execSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CI_INTERVAL_MS, CI_RESULTS_RELATIVE_PATH } from './ciConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const resultsPath = path.join(rootDir, CI_RESULTS_RELATIVE_PATH);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureStorageDir() {
    const dir = path.dirname(resultsPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readResults() {
    try {
        if (!fs.existsSync(resultsPath)) {
            return null;
        }
        const raw = fs.readFileSync(resultsPath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function writeResults(payload) {
    ensureStorageDir();
    fs.writeFileSync(resultsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function getSourceFingerprint() {
    const head = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();
    return crypto.createHash('sha256').update(`${head}\n${status}`).digest('hex');
}

function scheduleNextAt() {
    return new Date(Date.now() + CI_INTERVAL_MS).toISOString();
}

function runCommand(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: rootDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        ...options,
    });
}

function parseLintResults() {
    const result = runCommand('npx', ['eslint', '.', '--format', 'json']);
    const stdout = result.stdout ?? '';
    let errorCount = 0;
    try {
        const files = JSON.parse(stdout || '[]');
        if (Array.isArray(files)) {
            for (const file of files) {
                errorCount += file.errorCount ?? 0;
            }
        }
    } catch {
        if (result.status !== 0) {
            errorCount = 1;
        }
    }
    return { errorCount, exitCode: result.status ?? 1 };
}

function parseTestResults() {
    const outputFile = path.join(os.tmpdir(), `vibe-ci-vitest-${Date.now()}.json`);
    const result = runCommand('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${outputFile}`]);
    let passed = 0;
    let failed = 0;
    const failedNames = [];

    try {
        if (fs.existsSync(outputFile)) {
            const report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
            passed = report.numPassedTests ?? 0;
            failed = report.numFailedTests ?? 0;
            const suites = report.testResults ?? [];
            for (const suite of suites) {
                for (const assertion of suite.assertionResults ?? []) {
                    if (assertion.status === 'failed') {
                        failedNames.push(assertion.fullName ?? assertion.title ?? 'unknown test');
                    }
                }
            }
        }
    } catch {
        if (result.status !== 0) {
            failed = Math.max(failed, 1);
            failedNames.push('vitest run failed to produce a JSON report');
        }
    } finally {
        try {
            fs.unlinkSync(outputFile);
        } catch {
            /* ignore */
        }
    }

    return { passed, failed, failedNames, exitCode: result.status ?? 1 };
}

function parseTypecheckResults() {
    const result = runCommand('npx', ['tsc', '--noEmit', '--pretty', 'false']);
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const errorCount = (combined.match(/error TS\d+:/g) ?? []).length;
    return { errorCount: errorCount > 0 ? errorCount : result.status === 0 ? 0 : 1, exitCode: result.status ?? 1 };
}

function buildRunningPayload(previous, startedAt, nextScheduledAt) {
    return {
        startedAt,
        finishedAt: null,
        durationMs: null,
        nextScheduledAt,
        sourceFingerprint: previous?.sourceFingerprint,
        skipped: false,
        running: true,
        testsPassed: previous?.testsPassed ?? 0,
        testsFailed: previous?.testsFailed ?? 0,
        failedTestNames: previous?.failedTestNames ?? [],
        lintErrors: previous?.lintErrors ?? 0,
        typescriptErrors: previous?.typescriptErrors ?? 0,
    };
}

async function runCiCycle() {
    const fingerprint = getSourceFingerprint();
    const previous = readResults();
    const nextScheduledAt = scheduleNextAt();

    if (
        previous != null
        && previous.running !== true
        && previous.sourceFingerprint === fingerprint
        && typeof previous.finishedAt === 'string'
    ) {
        writeResults({
            ...previous,
            skipped: true,
            lastSkippedAt: new Date().toISOString(),
            nextScheduledAt,
            running: false,
        });
        console.log(`[ci] Source unchanged — skipping checks. Next run at ${nextScheduledAt}`);
        return;
    }

    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    writeResults(buildRunningPayload(previous, startedAt, nextScheduledAt));
    console.log(`[ci] Running lint, tests, and typecheck at ${startedAt}`);

    const lint = parseLintResults();
    const tests = parseTestResults();
    const typecheck = parseTypecheckResults();
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const payload = {
        startedAt,
        finishedAt,
        durationMs,
        nextScheduledAt,
        sourceFingerprint: fingerprint,
        skipped: false,
        running: false,
        testsPassed: tests.passed,
        testsFailed: tests.failed,
        failedTestNames: tests.failedNames,
        lintErrors: lint.errorCount,
        typescriptErrors: typecheck.errorCount,
    };

    writeResults(payload);

    console.log(
        `[ci] Finished in ${durationMs}ms — tests ${tests.passed} passed / ${tests.failed} failed, `
            + `lint ${lint.errorCount}, typescript ${typecheck.errorCount}. Next run at ${nextScheduledAt}`,
    );
}

async function main() {
    console.log('[ci] Continuous integration loop started (30 minute interval).');
    while (true) {
        try {
            await runCiCycle();
        } catch (error) {
            console.error('[ci] Cycle failed:', error);
            const previous = readResults();
            writeResults({
                ...(previous ?? {
                    startedAt: new Date().toISOString(),
                    testsPassed: 0,
                    testsFailed: 0,
                    failedTestNames: [],
                    lintErrors: 0,
                    typescriptErrors: 0,
                }),
                finishedAt: new Date().toISOString(),
                durationMs: null,
                nextScheduledAt: scheduleNextAt(),
                running: false,
                testsFailed: Math.max(previous?.testsFailed ?? 0, 1),
                failedTestNames: [...(previous?.failedTestNames ?? []), 'ci runner crashed'],
            });
        }
        await sleep(CI_INTERVAL_MS);
    }
}

main();
