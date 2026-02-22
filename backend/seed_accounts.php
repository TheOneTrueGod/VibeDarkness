<?php

/**
 * Seed default accounts. Run: php backend/seed_accounts.php
 */

require __DIR__ . '/../vendor/autoload.php';

use App\PlayerAccount;
use App\Storage\FlatFilePlayerAccountStorage;

$storage = new FlatFilePlayerAccountStorage();

$accounts = [
    ['username' => 'TheOneTrueGod', 'password' => 'ItsJeremy', 'role' => PlayerAccount::ROLE_ADMIN],
    ['username' => 'Guest', 'password' => 'guest', 'role' => PlayerAccount::ROLE_USER],
    ['username' => 'Guest2', 'password' => 'guest', 'role' => PlayerAccount::ROLE_USER],
    ['username' => 'Guest3', 'password' => 'guest', 'role' => PlayerAccount::ROLE_USER],
];

foreach ($accounts as $acc) {
    $existing = $storage->findByName($acc['username']);
    if ($existing !== null) {
        echo "Account '{$acc['username']}' already exists, skipping.\n";
        continue;
    }

    $resources = PlayerAccount::randomResources();
    $account = new PlayerAccount(
        $storage->nextId(),
        $acc['username'],
        PlayerAccount::hashPassword($acc['password']),
        $acc['role'],
        $resources['fire'],
        $resources['water'],
        $resources['earth'],
        $resources['air']
    );
    $storage->save($account);
    echo "Created account: {$acc['username']} (role: {$acc['role']})\n";
}

echo "Done.\n";
