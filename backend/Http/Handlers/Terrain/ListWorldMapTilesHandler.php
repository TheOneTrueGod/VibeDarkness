<?php

namespace App\Http\Handlers\Terrain;

use App\AccountService;
use App\LobbyManager;

/**
 * GET /api/terrain-world — every segment's preview status for the world map, without loading
 * terrain. Status is "fresh" (SVG newer than the map file), "stale" (SVG older; still returned)
 * or "missing". JSON segments also report their grid position.
 */
class ListWorldMapTilesHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        clearstatcache();
        $tiles = [];

        foreach (TerrainSegmentFiles::mapFiles() as $id => $file) {
            $mapModifiedAt = filemtime($file['path']) ?: null;
            $svgPath = TerrainSegmentFiles::svgPath($id, $file['path']);
            $svgModifiedAt = file_exists($svgPath) ? (filemtime($svgPath) ?: null) : null;

            $status = 'missing';
            if ($svgModifiedAt !== null) {
                $status = ($mapModifiedAt !== null && $svgModifiedAt < $mapModifiedAt) ? 'stale' : 'fresh';
            }

            $tile = [
                'id' => $id,
                'source' => $file['source'],
                'status' => $status,
                'svg' => $svgModifiedAt !== null ? file_get_contents($svgPath) : null,
            ];

            if ($file['source'] === 'json') {
                $data = json_decode(file_get_contents($file['path']), true);
                if (is_array($data) && isset($data['gridCol'], $data['gridRow'])) {
                    $tile['gridCol'] = $data['gridCol'];
                    $tile['gridRow'] = $data['gridRow'];
                }
            }

            $tiles[] = $tile;
        }

        return ['tiles' => $tiles];
    }
}
