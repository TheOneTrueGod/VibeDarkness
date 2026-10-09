<?php

namespace App\Migrations;

/**
 * Applies pending deploy-time migrations in version order.
 *
 * - The ledger's `currentVersion` is the last applied migration; everything above it is pending.
 * - An exclusive, non-blocking lock (<storage>/_migrations/migrate.lock) prevents two runs at once.
 * - Before each migration, its `touchedDirs()` are copied to
 *   <storage>/_migration_backup/v<N>_<name>_<timestamp>/.
 * - Each migration is recorded only after `up()` succeeds; the first failure stops the run.
 * - Refuses to run when storage is at a version newer than this code knows (rolled-back deploy).
 */
final class MigrationRunner
{
    public const EXIT_OK = 0;
    public const EXIT_FAILED = 1;
    public const EXIT_LOCKED = 3;

    /** @var list<Migration> */
    private array $migrations;
    /** @var \Closure(string): void */
    private \Closure $out;

    /**
     * @param list<Migration> $migrations
     * @param (\Closure(string): void)|null $out
     */
    public function __construct(
        private readonly string $storageDir,
        array $migrations,
        ?\Closure $out = null,
    ) {
        MigrationRegistry::validate($migrations);
        $this->migrations = $migrations;
        $this->out = $out ?? static function (string $line): void {
            echo $line . "\n";
        };
    }

    public function latestVersion(): int
    {
        return count($this->migrations);
    }

    /** @return list<Migration> */
    public function pending(MigrationLedger $ledger): array
    {
        return array_values(array_filter(
            $this->migrations,
            static fn (Migration $m): bool => $m->version() > $ledger->currentVersion()
        ));
    }

    public function status(): int
    {
        $ledger = MigrationLedger::load($this->storageDir);
        $this->say("Storage: {$this->storageDir}");
        $this->say("Current version: {$ledger->currentVersion()} (latest: {$this->latestVersion()})");
        foreach ($this->migrations as $m) {
            $entry = $ledger->entryFor($m->version());
            $state = $entry !== null ? 'applied ' . ($entry['appliedAt'] ?? '') : 'pending';
            $this->say(sprintf('  %04d %-40s %s', $m->version(), $m->name(), $state));
        }
        $this->warnOnChecksumDrift($ledger);
        return $this->checkNotAhead($ledger) ? self::EXIT_OK : self::EXIT_FAILED;
    }

    public function dryRun(): int
    {
        $ledger = MigrationLedger::load($this->storageDir);
        if (!$this->checkNotAhead($ledger)) {
            return self::EXIT_FAILED;
        }
        $pending = $this->pending($ledger);
        if ($pending === []) {
            $this->say("[dry-run] Up to date at version {$ledger->currentVersion()}.");
            return self::EXIT_OK;
        }
        $context = $this->context();
        foreach ($pending as $m) {
            $this->say(sprintf('[dry-run] %04d %s — %s', $m->version(), $m->name(), $m->description()));
            foreach ($m->plan($context) as $line) {
                $this->say('    ' . $line);
            }
        }
        $this->say('[dry-run] Nothing written.');
        return self::EXIT_OK;
    }

    public function migrate(): int
    {
        if (!is_dir($this->storageDir)) {
            $this->say("Storage directory not found: {$this->storageDir}");
            return self::EXIT_FAILED;
        }
        $lock = $this->acquireLock();
        if ($lock === null) {
            $this->say('Another migration run holds the lock; nothing done.');
            return self::EXIT_LOCKED;
        }
        try {
            $ledger = MigrationLedger::load($this->storageDir);
            if (!$this->checkNotAhead($ledger)) {
                return self::EXIT_FAILED;
            }
            $this->warnOnChecksumDrift($ledger);
            $pending = $this->pending($ledger);
            if ($pending === []) {
                $this->say("Up to date at version {$ledger->currentVersion()}.");
                return self::EXIT_OK;
            }
            $this->say(sprintf(
                'Migrating from version %d to %d (%d pending).',
                $ledger->currentVersion(),
                $this->latestVersion(),
                count($pending)
            ));
            foreach ($pending as $m) {
                $label = sprintf('%04d %s', $m->version(), $m->name());
                $started = microtime(true);
                try {
                    $backupDir = $this->backup($m);
                    $this->say("Applying {$label} (backup: {$backupDir})");
                    $m->up($this->context());
                } catch (\Throwable $e) {
                    $this->say("FAILED {$label}: {$e->getMessage()}");
                    $this->say("Stopped. Ledger remains at version {$ledger->currentVersion()}; fix and rerun.");
                    return self::EXIT_FAILED;
                }
                $ledger->record([
                    'version' => $m->version(),
                    'name' => $m->name(),
                    'checksum' => self::checksum($m),
                    'appliedAt' => gmdate('c'),
                    'durationMs' => (int) round((microtime(true) - $started) * 1000),
                    'backupDir' => $backupDir,
                ]);
                $this->say("Applied {$label}.");
            }
            $this->say("Now at version {$ledger->currentVersion()}.");
            return self::EXIT_OK;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public static function checksum(Migration $m): string
    {
        $file = (new \ReflectionClass($m))->getFileName();
        return $file !== false && is_file($file) ? hash_file('sha256', $file) : '';
    }

    private function context(): MigrationContext
    {
        $out = $this->out;
        return new MigrationContext($this->storageDir, static function (string $line) use ($out): void {
            $out('    ' . $line);
        });
    }

    private function checkNotAhead(MigrationLedger $ledger): bool
    {
        if ($ledger->currentVersion() > $this->latestVersion()) {
            $this->say(sprintf(
                'ERROR: storage is at migration version %d but this code only knows up to %d. '
                . 'Was a deploy rolled back? Refusing to run.',
                $ledger->currentVersion(),
                $this->latestVersion()
            ));
            return false;
        }
        return true;
    }

    private function warnOnChecksumDrift(MigrationLedger $ledger): void
    {
        foreach ($this->migrations as $m) {
            $entry = $ledger->entryFor($m->version());
            $recorded = is_array($entry) ? (string) ($entry['checksum'] ?? '') : '';
            if ($recorded !== '' && $recorded !== self::checksum($m)) {
                $this->say(sprintf(
                    'WARNING: applied migration %04d %s was modified after it ran. Shipped migrations must not change.',
                    $m->version(),
                    $m->name()
                ));
            }
        }
    }

    /** @return resource|null */
    private function acquireLock()
    {
        $dir = $this->storageDir . '/' . MigrationLedger::DIR;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $handle = fopen($dir . '/migrate.lock', 'c');
        if ($handle === false) {
            throw new \RuntimeException("Cannot open migration lock in {$dir}");
        }
        if (!flock($handle, LOCK_EX | LOCK_NB)) {
            fclose($handle);
            return null;
        }
        return $handle;
    }

    /** Copy the migration's touched dirs; returns the backup path relative to storage. */
    private function backup(Migration $m): string
    {
        $relative = sprintf('_migration_backup/v%04d_%s_%s', $m->version(), $m->name(), gmdate('Ymd_His'));
        $root = $this->storageDir . '/' . $relative;
        foreach ($m->touchedDirs() as $sub) {
            $src = $this->storageDir . '/' . $sub;
            if (is_dir($src)) {
                self::copyDir($src, $root . '/' . $sub);
            }
        }
        return $relative;
    }

    private static function copyDir(string $src, string $dest): void
    {
        if (!is_dir($dest) && !mkdir($dest, 0755, true) && !is_dir($dest)) {
            throw new \RuntimeException("Cannot create backup dir {$dest}");
        }
        foreach (scandir($src) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..' || str_ends_with($entry, '.lock')) {
                continue;
            }
            $from = $src . '/' . $entry;
            $to = $dest . '/' . $entry;
            if (is_dir($from)) {
                self::copyDir($from, $to);
            } elseif (!copy($from, $to)) {
                throw new \RuntimeException("Backup copy failed: {$from}");
            }
        }
    }

    private function say(string $line): void
    {
        ($this->out)($line);
    }
}
