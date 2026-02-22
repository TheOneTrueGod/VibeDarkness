<?php

namespace App;

use App\Storage\PlayerAccountStorageInterface;

/**
 * Service for login, account creation, and account lookup.
 * Uses storage abstraction so the persistence layer can be swapped.
 */
class AccountService
{
    public function __construct(
        private PlayerAccountStorageInterface $storage
    ) {}

    /**
     * Log in with username and password. Returns account on success.
     */
    public function login(string $username, string $password): PlayerAccount
    {
        $username = trim($username);
        if ($username === '') {
            throw new \InvalidArgumentException('Username is required');
        }

        $account = $this->storage->findByName($username);
        if ($account === null) {
            throw new \InvalidArgumentException('Invalid username or password');
        }

        if (! $account->verifyPassword($password)) {
            throw new \InvalidArgumentException('Invalid username or password');
        }

        return $account;
    }

    /**
     * Create a new account with username and password.
     */
    public function createAccount(string $username, string $password): PlayerAccount
    {
        $username = trim($username);
        if ($username === '') {
            throw new \InvalidArgumentException('Username is required');
        }
        if (strlen($password) < 1) {
            throw new \InvalidArgumentException('Password is required');
        }

        $existing = $this->storage->findByName($username);
        if ($existing !== null) {
            throw new \InvalidArgumentException('Username already exists');
        }

        $id = $this->storage->nextId();
        $resources = PlayerAccount::randomResources();
        $account = new PlayerAccount(
            $id,
            $username,
            PlayerAccount::hashPassword($password),
            PlayerAccount::ROLE_USER,
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
