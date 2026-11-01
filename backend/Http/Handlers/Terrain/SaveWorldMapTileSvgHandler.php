<?php

namespace App\Http\Handlers\Terrain;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

/**
 * PUT /api/terrain-world/{id}/svg — admin only. Body: {"svg": "<svg ...>"}. Writes the segment's
 * world-map preview next to its map file ({id}.svg).
 */
class SaveWorldMapTileSvgHandler
{
    private const MAX_SVG_BYTES = 65536;

    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $adminAccountId = SessionHelper::getAccountId();
        if ($adminAccountId === null || $adminAccountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }
        $adminAccount = $accountService->getAccountById($adminAccountId);
        if ($adminAccount === null || $adminAccount->getRole() !== PlayerAccount::ROLE_ADMIN) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Admins only'];
        }

        $id = $matches[1] ?? '';
        if (!preg_match(TerrainSegmentFiles::ID_PATTERN, $id)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid segment id'];
        }

        $body = json_decode(file_get_contents('php://input'), true);
        $svg = is_array($body) ? ($body['svg'] ?? null) : null;
        if (!is_string($svg) || !preg_match('#^<svg[\s>]#', $svg) || strlen($svg) > self::MAX_SVG_BYTES
            || stripos($svg, '<script') !== false) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Body must be {"svg": "<svg ...>"} without scripts'];
        }

        $mapFile = TerrainSegmentFiles::mapFiles()[$id] ?? null;
        $svgPath = TerrainSegmentFiles::svgPath($id, $mapFile['path'] ?? null);

        if (file_put_contents($svgPath, $svg) === false) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to write preview file'];
        }

        return ['success' => true];
    }
}
