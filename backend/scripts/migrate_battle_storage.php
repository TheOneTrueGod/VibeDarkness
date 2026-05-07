<?php

/**
 * One-shot migration cleanup for old battle checkpoint layout.
 *
 * Removes stale directories under storage/lobbies/* named `game_*`
 * when they contain legacy checkpoint files matching:
 *   game_*_<digits>.json
 *
 * This intentionally leaves untouched:
 * - lobby JSON files (storage/lobbies/<lobbyId>.json)
 * - account/campaign/character data (outside storage/lobbies)
 * - new layout directories (storage/lobbies/<lobbyId>/games/<gameId>/...)
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script must be run from CLI.\n");
    exit(1);
}

$rootDir = dirname(__DIR__, 2);
$lobbiesRoot = $rootDir . '/storage/lobbies';

if (!is_dir($lobbiesRoot)) {
    fwrite(STDOUT, "No lobbies directory found at: {$lobbiesRoot}\n");
    fwrite(STDOUT, "Migration complete.\n");
    fwrite(STDOUT, "Lobbies scanned: 0\n");
    fwrite(STDOUT, "Stale dirs removed: 0\n");
    fwrite(STDOUT, "Bytes reclaimed: 0\n");
    exit(0);
}

$lobbiesScanned = 0;
$staleDirsRemoved = 0;
$bytesReclaimed = 0;

$lobbyEntries = scandir($lobbiesRoot);
if ($lobbyEntries === false) {
    fwrite(STDERR, "Failed to scan lobbies directory: {$lobbiesRoot}\n");
    exit(1);
}

foreach ($lobbyEntries as $lobbyEntry) {
    if ($lobbyEntry === '.' || $lobbyEntry === '..') {
        continue;
    }
    $lobbyDir = $lobbiesRoot . '/' . $lobbyEntry;
    if (!is_dir($lobbyDir) || is_link($lobbyDir)) {
        continue;
    }

    $lobbiesScanned++;

    $childEntries = scandir($lobbyDir);
    if ($childEntries === false) {
        continue;
    }

    foreach ($childEntries as $childEntry) {
        if ($childEntry === '.' || $childEntry === '..') {
            continue;
        }
        if (!preg_match('/^game_.+$/', $childEntry)) {
            continue;
        }

        $candidateDir = $lobbyDir . '/' . $childEntry;
        if (!is_dir($candidateDir) || is_link($candidateDir)) {
            continue;
        }

        if (!containsLegacyCheckpointFiles($candidateDir)) {
            continue;
        }

        $bytesInDir = getTreeSizeBytes($candidateDir);
        removeTreeRecursively($candidateDir);

        if (!is_dir($candidateDir)) {
            $staleDirsRemoved++;
            $bytesReclaimed += $bytesInDir;
        } else {
            fwrite(STDERR, "Warning: failed to remove stale dir: {$candidateDir}\n");
        }
    }
}

fwrite(STDOUT, "Migration complete.\n");
fwrite(STDOUT, "Lobbies scanned: {$lobbiesScanned}\n");
fwrite(STDOUT, "Stale dirs removed: {$staleDirsRemoved}\n");
fwrite(STDOUT, "Bytes reclaimed: {$bytesReclaimed}\n");

/**
 * Returns true when a directory tree contains any file that matches
 * the legacy checkpoint naming format: game_*_<digits>.json
 */
function containsLegacyCheckpointFiles(string $dir): bool
{
    $entries = scandir($dir);
    if ($entries === false) {
        return false;
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $dir . '/' . $entry;
        if (is_dir($path) && !is_link($path)) {
            if (containsLegacyCheckpointFiles($path)) {
                return true;
            }
            continue;
        }
        if (is_file($path) && preg_match('/^game_.+_[0-9]+\.json$/', $entry)) {
            return true;
        }
    }

    return false;
}

/**
 * Returns total bytes for all files in the tree.
 */
function getTreeSizeBytes(string $dir): int
{
    $entries = scandir($dir);
    if ($entries === false) {
        return 0;
    }

    $total = 0;
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $dir . '/' . $entry;
        if (is_dir($path) && !is_link($path)) {
            $total += getTreeSizeBytes($path);
            continue;
        }

        if (is_file($path)) {
            $size = filesize($path);
            if (is_int($size)) {
                $total += $size;
            }
        }
    }

    return $total;
}

/**
 * Recursive, symlink-safe delete helper.
 */
function removeTreeRecursively(string $dir): void
{
    $entries = scandir($dir);
    if ($entries === false) {
        return;
    }
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $dir . '/' . $entry;
        if (is_dir($path) && !is_link($path)) {
            removeTreeRecursively($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}
