<?php

namespace App\SaveData;

/**
 * Resolves the storage directory. Defaults to <repo>/storage; the migration script can
 * redirect it (--storage) so managers read and write a scratch copy instead.
 */
final class StorageRoot
{
    private static ?string $override = null;

    public static function setOverride(?string $dir): void
    {
        self::$override = $dir === null ? null : rtrim(str_replace('\\', '/', $dir), '/');
    }

    public static function get(): string
    {
        return self::$override ?? dirname(__DIR__, 2) . '/storage';
    }

    public static function path(string $sub): string
    {
        return self::get() . '/' . $sub;
    }
}
