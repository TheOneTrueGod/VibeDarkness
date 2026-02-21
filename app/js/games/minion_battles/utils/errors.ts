/**
 * Error reporting for Minion Battles.
 * For now uses console.error; can be extended to report to a backend or toast.
 */
export type ErrorSeverity = 'low' | 'medium' | 'high';

export interface ThrowErrorOptions {
    severity: ErrorSeverity;
    message: string;
    /** Field paths that differ (e.g. ['units.0.hp', 'gameTick']) */
    details?: Record<string, unknown>;
}

/**
 * Report an error. Currently logs to console.error.
 * Severity: low (info), medium (desync, recoverable), high (critical).
 */
export function throwError(opts: ThrowErrorOptions): void {
    const { severity, message, details } = opts;
    const payload = details ? { ...opts, details } : opts;
    console.error(`[MinionBattles ${severity}]`, message, payload);
}
