<?php

namespace App;

/**
 * Helper for PHP session handling.
 */
class SessionHelper
{
    private const ACCOUNT_ID_KEY = 'accountId';

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    public static function setAccountId(int $accountId): void
    {
        self::start();
        $_SESSION[self::ACCOUNT_ID_KEY] = $accountId;
    }

    public static function getAccountId(): ?int
    {
        self::start();
        $id = $_SESSION[self::ACCOUNT_ID_KEY] ?? null;
        return is_numeric($id) ? (int) $id : null;
    }

    public static function clear(): void
    {
        self::start();
        unset($_SESSION[self::ACCOUNT_ID_KEY]);
    }

    public static function hasSession(): bool
    {
        return self::getAccountId() !== null;
    }
}
