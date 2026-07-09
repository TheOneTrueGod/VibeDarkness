/**
 * @typedef {object} CiResults
 * @property {string} startedAt ISO-8601 timestamp when the run began (or last completed run when skipped).
 * @property {string | null} finishedAt ISO-8601 when checks finished; null while a run is in progress.
 * @property {number | null} durationMs Wall-clock milliseconds for the last completed run.
 * @property {string} nextScheduledAt ISO-8601 when the next run is scheduled.
 * @property {string} [sourceFingerprint] Git tree fingerprint from the last completed run.
 * @property {boolean} [skipped] True when the latest cycle skipped checks because the tree was unchanged.
 * @property {string} [lastSkippedAt] ISO-8601 when checks were last skipped.
 * @property {boolean} [running] True while lint / test / typecheck are executing.
 * @property {number} testsPassed
 * @property {number} testsFailed
 * @property {string[]} failedTestNames
 * @property {number} lintErrors
 * @property {number} typescriptErrors
 */

export {};
