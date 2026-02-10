<?php

namespace App;

use App\Storage\PlayerAccountStorageInterface;

/**
 * Service for sign-in and account lookup.
 * Uses storage abstraction so the persistence layer can be swapped.
 */
class AccountService
{
    public function __construct(
        private PlayerAccountStorageInterface $storage
    ) {}

    /**
     * Get existing account by name or create a new one with random resources.
     */
    public function signIn(string $name): PlayerAccount
    {
        $name = trim($name);
        if ($name === '') {
            throw new \InvalidArgumentException('Name is required');
        }

        $existing = $this->storage->findByName($name);
        if ($existing !== null) {
            return $existing;
        }

        $id = $this->storage->nextId();
        $resources = PlayerAccount::randomResources();
        $account = new PlayerAccount(
            $id,
            $name,
            $resources['fire'],
            $resources['water'],
            $resources['earth'],
            $resources['air']
        );
        $this->storage->save($account);
        return $account;
    }

    public function getAccountById(int $id): ?PlayerAccount
    {
        return $this->storage->findById($id);
    }
}
