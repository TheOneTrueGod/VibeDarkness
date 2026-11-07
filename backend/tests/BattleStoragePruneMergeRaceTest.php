<?php

/**
 * Standalone check (no PHPUnit in this repo): `php backend/tests/BattleStoragePruneMergeRaceTest.php`.
 * Exits non-zero on failure.
 *
 * Playtest 0003, lobby 83C3E9 (P0.15): the host appended its finalized order for batch 814, then its
 * pause snapshot for tick 816 arrived before its merge for batch 814. `prunePendingOrdersAfterSnapshot`
 * keeps only rows for tick 817, so it deleted the 814 order; the merge then had nothing to move. The
 * host had already applied the order locally, peers never got it, and they formed an order pause for
 * that unit the host never formed ("paused behind host tail — forcing full resync").
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
    $root = sys_get_temp_dir() . '/battle_prune_race_test_' . bin2hex(random_bytes(6));
    mkdir($root, 0755, true);

    return [new BattleStorage($root), $root];
}

function order(string $unitId, string $abilityId, bool $endTurn = true): array
{
    return ['unitId' => $unitId, 'abilityId' => $abilityId, 'targets' => [], 'endTurn' => $endTurn];
}

/** @return list<string> idHashes served to peers (pending overlay + applied) for `$atTick`. */
function servedAt(BattleStorage $s, string $lobby, string $game, int $atTick): array
{
    $out = [];
    foreach ($s->getOrdersRangeSplit($lobby, $game, 0, null)['orders'] as $rec) {
        if ((int) $rec['atTick'] === $atTick) {
            $out[] = (string) $rec['idHash'];
        }
    }

    return $out;
}

/** @return list<string> idHashes in applied_orders.jsonl. */
function appliedHashes(BattleStorage $s, string $lobby, string $game): array
{
    $path = $s->getGameDir($lobby, $game) . '/applied_orders.jsonl';
    if (!is_file($path)) {
        return [];
    }
    $out = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $rec = json_decode($line, true);
        if (is_array($rec)) {
            $out[] = (string) $rec['idHash'];
        }
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

// 1. The 83C3E9 race: snapshot for a later tick lands before the merge of the earlier batch.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 814, 'playerId' => 'host', 'order' => order('unit_2', '0101'), 'idHash' => 'hostDodge', 'finalized' => true]);
$s->prunePendingOrdersAfterSnapshot($lobby, $game, 816);
$s->mergeFinalizedPendingForBatch($lobby, $game, 814);
check(in_array('hostDodge', appliedHashes($s, $lobby, $game), true), 'a finalized order for an earlier batch survives a later snapshot prune (lands in applied)');
check(servedAt($s, $lobby, $game, 814) === ['hostDodge'], 'peers are still served the 814 order');
removeTree($root);

// 2. The normal order (merge first, then snapshot) is unchanged: exactly one applied row.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 814, 'playerId' => 'host', 'order' => order('unit_2', '0101'), 'idHash' => 'hostDodge', 'finalized' => true]);
$s->mergeFinalizedPendingForBatch($lobby, $game, 814);
$s->prunePendingOrdersAfterSnapshot($lobby, $game, 816);
check(appliedHashes($s, $lobby, $game) === ['hostDodge'], 'merge-then-prune still yields one applied row');
removeTree($root);

// 3. Drafts (finalized=false) for past batches are still dropped by the prune.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 814, 'playerId' => 'p1', 'order' => order('unit_1', 'wait', false), 'idHash' => 'oldDraft', 'finalized' => false]);
$s->prunePendingOrdersAfterSnapshot($lobby, $game, 816);
check(!in_array('oldDraft', appliedHashes($s, $lobby, $game), true), 'a past-batch draft is not promoted to applied');
check(servedAt($s, $lobby, $game, 814) === [], 'a past-batch draft is dropped');
removeTree($root);

// 4. A late finalized row whose (player, unit, batch) already has an applied row is not duplicated.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 814, 'playerId' => 'host', 'order' => order('unit_2', '0101'), 'idHash' => 'first', 'finalized' => true]);
$s->mergeFinalizedPendingForBatch($lobby, $game, 814);
$s->appendOrder($lobby, $game, ['atTick' => 814, 'playerId' => 'host', 'order' => order('unit_2', '0120'), 'idHash' => 'lateResend', 'finalized' => true]);
$s->prunePendingOrdersAfterSnapshot($lobby, $game, 816);
check(appliedHashes($s, $lobby, $game) === ['first'], 'the already-merged batch keeps its single applied row');
removeTree($root);

// 5. Rows for the next batch still stay pending.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 817, 'playerId' => 'p1', 'order' => order('unit_1', '0101'), 'idHash' => 'next', 'finalized' => true]);
$s->prunePendingOrdersAfterSnapshot($lobby, $game, 816);
$pending = $s->getOrdersRangeSplit($lobby, $game, 0, null)['pending'];
check(count($pending) === 1 && $pending[0]['idHash'] === 'next', 'next-batch rows stay pending');
removeTree($root);

echo $failures === 0 ? "All checks passed\n" : "{$failures} check(s) failed\n";
exit($failures === 0 ? 0 : 1);
