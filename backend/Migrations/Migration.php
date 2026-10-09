<?php

namespace App\Migrations;

/**
 * One deploy-time data migration over flat-file storage.
 *
 * Rules (see MigrationRunner for how they are applied):
 *  - Versions are consecutive integers starting at 1, listed in MigrationRegistry.
 *  - A migration is immutable once shipped: never edit or renumber it — add a new one.
 *    The runner records a checksum of each applied migration's file and warns on drift.
 *  - `up()` must be idempotent and safe to re-run: if it fails half-way it is not recorded,
 *    so the next run executes it again from the start.
 *  - Forward-only: there is no `down()`. Recovery is restoring the automatic backup taken
 *    before the migration ran (storage/_migration_backup/).
 *  - Use the `storageDir` from the context, never a hard-coded path.
 */
abstract class Migration
{
    /** Consecutive version number (1, 2, 3, ...). */
    abstract public function version(): int;

    /** Short snake_case name, used in the ledger and backup folder names. */
    abstract public function name(): string;

    /** One-line description printed by `--status`. */
    abstract public function description(): string;

    /**
     * Storage subdirectories (relative to the storage root) this migration may modify.
     * They are copied to the backup folder before `up()` runs.
     *
     * @return list<string>
     */
    abstract public function touchedDirs(): array;

    /**
     * Describe what `up()` would change without writing anything (for `--dry-run`).
     *
     * @return list<string>
     */
    abstract public function plan(MigrationContext $context): array;

    /** Apply the migration. Throw to abort; the runner stops and records nothing for it. */
    abstract public function up(MigrationContext $context): void;
}
