<?php

namespace App;

/**
 * Development-only per-request timing log for API requests dispatched from index.php.
 *
 * One JSON line per request, written to an hourly file:
 *   storage/perf-trace/server-requests/requests-YYYYMMDD-HH.jsonl   (server local time)
 *
 * Only active when APP_ENV=development (set by nodemon.json for `npm run php`).
 *
 * Timestamps are unix seconds with microseconds:
 *   - receivedAt   $_SERVER['REQUEST_TIME_FLOAT'] — when PHP began handling the request. With the
 *                  single-threaded `php -S` server, time a request spent queued behind another one is
 *                  NOT visible here; compare against the client-side send time (X-Client-Sent-At,
 *                  when the client supplies it) to measure queue wait.
 *   - startedAt    top of the dispatch wrapper (after static-file routing)
 *   - endedAt      shutdown, after the response has been echoed
 *
 * Log files older than {@see RETENTION_SECONDS} are deleted when the server (re)starts. PHP's built-in
 * server runs index.php per request with no startup hook, so a restart is detected by the PHP pid
 * changing relative to a marker file (and, for very long-lived servers, by the marker going stale).
 */
final class RequestTimingLog
{
    private const RETENTION_SECONDS = 3 * 24 * 3600;
    private const MARKER_STALE_SECONDS = 3600;
    private const MARKER_FILE = '.cleanup-marker';

    private function __construct(
        private readonly float $receivedAt,
        private readonly float $startedAt,
        private readonly string $method,
        private readonly string $path,
        private readonly string $query,
        private readonly ?float $clientSentAtMs,
    ) {
    }

    public static function isEnabled(): bool
    {
        return getenv('APP_ENV') === 'development';
    }

    /**
     * Start timing the current request and arrange for the line to be written at shutdown.
     * No-op outside development. Never throws.
     *
     * @param float $scriptStart microtime(true) captured at the top of index.php
     */
    public static function begin(float $scriptStart, string $method, string $path): void
    {
        if (!self::isEnabled()) {
            return;
        }
        try {
            self::cleanupOnRestart();
            $clientSent = $_SERVER['HTTP_X_CLIENT_SENT_AT'] ?? null;
            $entry = new self(
                isset($_SERVER['REQUEST_TIME_FLOAT']) ? (float) $_SERVER['REQUEST_TIME_FLOAT'] : $scriptStart,
                microtime(true),
                $method,
                $path,
                (string) ($_SERVER['QUERY_STRING'] ?? ''),
                is_string($clientSent) && is_numeric($clientSent) ? (float) $clientSent : null,
            );
            register_shutdown_function(static function () use ($entry): void {
                $entry->write();
            });
        } catch (\Throwable) {
            // Diagnostics must never affect request handling.
        }
    }

    public static function logDir(): string
    {
        return dirname(__DIR__) . '/storage/perf-trace/server-requests';
    }

    private function write(): void
    {
        try {
            $endedAt = microtime(true);
            $dir = self::logDir();
            if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
                return;
            }
            $record = [
                'method' => $this->method,
                'path' => $this->path,
                'query' => $this->query,
                'status' => http_response_code() ?: 200,
                'pid' => getmypid(),
                'receivedAt' => round($this->receivedAt, 6),
                'startedAt' => round($this->startedAt, 6),
                'endedAt' => round($endedAt, 6),
                'preDispatchMs' => round(($this->startedAt - $this->receivedAt) * 1000, 3),
                'handlerMs' => round(($endedAt - $this->startedAt) * 1000, 3),
                'totalMs' => round(($endedAt - $this->receivedAt) * 1000, 3),
                'peakMemoryBytes' => memory_get_peak_usage(true),
            ];
            if ($this->clientSentAtMs !== null) {
                $record['clientSentAtMs'] = $this->clientSentAtMs;
                $record['clientToReceivedMs'] = round($this->receivedAt * 1000 - $this->clientSentAtMs, 3);
            }
            $line = json_encode($record, JSON_UNESCAPED_SLASHES);
            if ($line === false) {
                return;
            }
            $file = $dir . '/requests-' . date('Ymd-H', (int) $this->receivedAt) . '.jsonl';
            @file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);
        } catch (\Throwable) {
        }
    }

    /**
     * Delete hourly log files older than the retention window, once per server start.
     */
    private static function cleanupOnRestart(): void
    {
        $dir = self::logDir();
        if (!is_dir($dir)) {
            return;
        }
        $marker = $dir . '/' . self::MARKER_FILE;
        $pid = (string) getmypid();
        $last = @file_get_contents($marker);
        $markerAge = is_file($marker) ? time() - (int) @filemtime($marker) : PHP_INT_MAX;
        if ($last === $pid && $markerAge < self::MARKER_STALE_SECONDS) {
            return;
        }
        @file_put_contents($marker, $pid, LOCK_EX);

        $cutoff = time() - self::RETENTION_SECONDS;
        foreach (glob($dir . '/requests-*.jsonl') ?: [] as $file) {
            $mtime = @filemtime($file);
            if ($mtime !== false && $mtime < $cutoff) {
                @unlink($file);
            }
        }
    }
}
