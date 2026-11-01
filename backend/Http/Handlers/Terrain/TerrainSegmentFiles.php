<?php

namespace App\Http\Handlers\Terrain;

/**
 * Locates map segment files on disk and the world-map preview SVG saved next to each one.
 *
 * Segments live either as editor JSON in storage/terrain-segments/{id}.json or as TypeScript
 * files under app/js/games/minion_battles/storylines/{storyline}/MapSegments/ named {id}.ts.
 * JSON wins when both exist, matching the editor's segment selector.
 */
class TerrainSegmentFiles
{
    public const ID_PATTERN = '#^[a-z0-9_-]+$#';
    /** TS segment files are named {gridCol}_{gridRow}_{name}.ts; anything else (index.ts, helpers) is skipped. */
    private const TS_SEGMENT_FILE_PATTERN = '#^-?\d+_-?\d+_#';

    public static function rootDir(): string
    {
        return __DIR__ . '/../../../..';
    }

    public static function storageDir(): string
    {
        return self::rootDir() . '/storage/terrain-segments';
    }

    /**
     * @return array<string, array{path: string, source: string}> segment id => map file
     */
    public static function mapFiles(): array
    {
        $files = [];

        $storylinesDir = self::rootDir() . '/app/js/games/minion_battles/storylines';
        if (is_dir($storylinesDir)) {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($storylinesDir, \FilesystemIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                $path = str_replace('\\', '/', $file->getPathname());
                if (!str_contains($path, '/MapSegments/') || !str_ends_with($path, '.ts') || str_ends_with($path, '.test.ts')) {
                    continue;
                }
                $id = basename($path, '.ts');
                if (preg_match(self::ID_PATTERN, $id) && preg_match(self::TS_SEGMENT_FILE_PATTERN, $id)) {
                    $files[$id] = ['path' => $path, 'source' => 'ts'];
                }
            }
        }

        if (is_dir(self::storageDir())) {
            foreach (glob(self::storageDir() . '/*.json') as $path) {
                $files[basename($path, '.json')] = ['path' => $path, 'source' => 'json'];
            }
        }

        return $files;
    }

    /** Preview SVG path for a segment: next to its map file, or in storage when no file was found. */
    public static function svgPath(string $id, ?string $mapPath): string
    {
        if ($mapPath === null) {
            return self::storageDir() . '/' . $id . '.svg';
        }
        return dirname($mapPath) . '/' . $id . '.svg';
    }
}
