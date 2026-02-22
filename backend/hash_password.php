<?php

/**
 * Generate a password hash for a given password.
 * Usage: php backend/hash_password.php <password>
 * Example: php backend/hash_password.php ItsJeremy
 */

$password = $argv[1] ?? null;
if ($password === null || $password === '') {
    fwrite(STDERR, "Usage: php backend/hash_password.php <password>\n");
    exit(1);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
echo $hash . "\n";