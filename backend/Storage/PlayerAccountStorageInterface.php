<?php

namespace App\Storage;

use App\PlayerAccount;

/**
 * Abstraction for persisting player accounts.
 * Implementations can use flat files, database, etc.
 */
interface PlayerAccountStorageInterface
{
    /**
     * Find an account by numeric ID
     */
    public function findById(int $id): ?PlayerAccount;

    /**
     * Find an account by display name (unique per account)
     */
    public function findByName(string $name): ?PlayerAccount;

    /**
     * Persist an account. Creates new or overwrites existing by ID.
     */
    public function save(PlayerAccount $account): void;

    /**
     * Reserve and return the next auto-increment ID
     */
    public function nextId(): int;
}
