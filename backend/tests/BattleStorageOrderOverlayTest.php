<?php

/**
 * Standalone check (no PHPUnit in this repo): `php backend/tests/BattleStorageOrderOverlayTest.php`.
 * Exits non-zero on failure.
 *
 * Lobby E7F4B2: a player's move draft (finalized=false) stayed in pending after their end-turn order
 * merged to applied, and the overlay preferred pending, so peers never saw the end-turn order.
 */

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use App\BattleStorage;

$failures = 0;

function check(bool $ok, string $label): void
{
    global $failures;
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . "\n";
    if (!$ok) {
        $failures++;
    }
}

function makeStorage(): array
{
    $root = sys_get_temp_dir() . '/battle_overlay_test_' . bin2hex(random_bytes(6));
    mkdir($root, 0755, true);

    return [new BattleStorage($root), $root];
}

function order(string $unitId, bool $endTurn): array
{
    return ['unitId' => $unitId, 'abilityId' => 'wait', 'targets' => [], 'endTurn' => $endTurn];
}

/** @return array<string,string> unitId => idHash served in `orders` */
function servedHashes(BattleStorage $s, string $lobby, string $game): array
{
    $out = [];
    foreach ($s->getOrdersRangeSplit($lobby, $game, 0, null)['orders'] as $rec) {
        $out[(string) $rec['order']['unitId']] = (string) $rec['idHash'];
    }

    return $out;
}

function removeTree(string $dir): void
{
    foreach (new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    ) as $f) {
        $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
    rmdir($dir);
}

$lobby = 'L1';
$game = 'g1';

// 1. Merge drops the batch's drafts along with its finalized row; peers get the end-turn order.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', false), 'idHash' => 'draft', 'finalized' => false]);
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'final', 'finalized' => true]);
$merge = $s->mergeFinalizedPendingForBatch($lobby, $game, 2);
check($merge['merged'] === 1, 'merge moves the finalized row');
$split = $s->getOrdersRangeSplit($lobby, $game, 0, null);
check(count($split['pending']) === 0, 'merge removes the draft for the same player, unit and batch');
check((servedHashes($s, $lobby, $game)['unit_2'] ?? null) === 'final', 'orders serves the merged end-turn order');
removeTree($root);

// 2. A draft for another unit, or for a unit with no finalized row yet, stays pending.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'hostFinal', 'finalized' => true]);
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'p1', 'order' => order('unit_1', false), 'idHash' => 'p1Draft', 'finalized' => false]);
$s->mergeFinalizedPendingForBatch($lobby, $game, 2);
$pending = $s->getOrdersRangeSplit($lobby, $game, 0, null)['pending'];
check(count($pending) === 1 && $pending[0]['idHash'] === 'p1Draft', 'an unfinished unit keeps its draft in pending');
removeTree($root);

// 3. Overlay backstop: a draft re-appended after the merge still loses to the applied final order.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'final', 'finalized' => true]);
$s->mergeFinalizedPendingForBatch($lobby, $game, 2);
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', false), 'idHash' => 'lateDraft', 'finalized' => false]);
check((servedHashes($s, $lobby, $game)['unit_2'] ?? null) === 'final', 'a finalized applied row beats a pending draft');
removeTree($root);

// 4. Unchanged: among finalized rows, pending still wins over applied (a re-sent final for the batch).
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'first', 'finalized' => true]);
$s->mergeFinalizedPendingForBatch($lobby, $game, 2);
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'second', 'finalized' => true]);
check((servedHashes($s, $lobby, $game)['unit_2'] ?? null) === 'second', 'pending finalized row still wins over applied finalized row');
removeTree($root);

echo $failures === 0 ? "All checks passed\n" : "{$failures} check(s) failed\n";
exit($failures === 0 ? 0 : 1);
