<?php

namespace App\Migrations;

/** What a migration gets to work with: the storage root and an output sink. */
final class MigrationContext
{
    /** @param \Closure(string): void $log */
    public function __construct(
        public readonly string $storageDir,
        private readonly \Closure $log,
    ) {
    }

    public function log(string $line): void
    {
        ($this->log)($line);
    }
}
