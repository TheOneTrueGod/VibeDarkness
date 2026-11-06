<?php

/**
 * Standalone check (no PHPUnit in this repo): `php backend/tests/BattleStorageOrdersRevisionTest.php`.
 * Exits non-zero on failure.
 *
 * Playtest 0003, lobby 83C3E9 (hardlock at tick 421): the heartbeat's `ordersRecordCount` was a line
 * count across pending + applied. A peer's move draft was fetched and applied by the host; the
 * end-turn order then replaced it, and the merge dropped the draft while appending the final row, so
 * the count was unchanged. Clients only refetch when the counter increases, so the host never saw
 * the end-turn order and waited for that player forever. The counter must strictly increase on every
 * change to the order streams.
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
    $root = sys_get_temp_dir() . '/battle_revision_test_' . bin2hex(random_bytes(6));
    mkdir($root, 0755, true);

    return [new BattleStorage($root), $root];
}

function order(string $unitId, bool $endTurn): array
{
    return ['unitId' => $unitId, 'abilityId' => 'wait', 'targets' => [], 'endTurn' => $endTurn];
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

// 1. The 83C3E9 sequence: host final, peer draft (fetched), peer final, merge.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 421, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'hostFinal', 'finalized' => true]);
$s->appendOrder($lobby, $game, ['atTick' => 421, 'playerId' => 'p1', 'order' => order('unit_1', false), 'idHash' => 'p1Draft', 'finalized' => false]);
$seenByHost = $s->getOrdersRevision($lobby, $game);
$s->appendOrder($lobby, $game, ['atTick' => 421, 'playerId' => 'p1', 'order' => order('unit_1', true), 'idHash' => 'p1Final', 'finalized' => true]);
$afterFinal = $s->getOrdersRevision($lobby, $game);
$s->mergeFinalizedPendingForBatch($lobby, $game, 421);
$afterMerge = $s->getOrdersRevision($lobby, $game);
check($afterFinal > $seenByHost, 'appending the end-turn order raises the revision');
check($afterMerge > $seenByHost, 'after the merge drops the draft, the revision is still above what the host saw');
check($afterMerge >= $afterFinal, 'the merge never lowers the revision');
removeTree($root);

// 2. A duplicate append (same idHash) changes nothing, so the revision stays put.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'same', 'finalized' => true]);
$before = $s->getOrdersRevision($lobby, $game);
$dup = $s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'same', 'finalized' => true]);
check($dup['appended'] === false, 'duplicate idHash is not appended');
check($s->getOrdersRevision($lobby, $game) === $before, 'duplicate append keeps the revision');
removeTree($root);

// 3. Lobbies from before the revision file: the first read seeds it from the line count, so a
//    client's existing baseline (the old count) is never above the new value.
[$s, $root] = makeStorage();
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'host', 'order' => order('unit_2', true), 'idHash' => 'a', 'finalized' => true]);
$s->appendOrder($lobby, $game, ['atTick' => 2, 'playerId' => 'p1', 'order' => order('unit_1', true), 'idHash' => 'b', 'finalized' => true]);
@unlink($s->getGameDir($lobby, $game) . '/orders_revision.json');
check($s->getOrdersRevision($lobby, $game) >= $s->countOrderRecords($lobby, $game), 'a missing revision seeds from the line count');
removeTree($root);

echo $failures === 0 ? "All checks passed\n" : "{$failures} check(s) failed\n";
exit($failures === 0 ? 0 : 1);
