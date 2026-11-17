<?php

/**
 * Standalone check (no PHPUnit in this repo): `php backend/tests/ReactionClaimRecordTest.php`.
 * Exits non-zero on failure.
 *
 * Step 15 (Garden Heart + Reactions): a co-op Reaction claim is recorded in the replayed order stream through
 * AppendReactionClaimHandler::record. It appends one finalized row, bumps the orders revision, is idempotent,
 * never shadows the claimant's real order at the same tick, and the ordinary batch merge carries it to applied.
 */

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use App\BattleStorage;
use App\Http\Handlers\Battle\AppendReactionClaimHandler;

$failures = 0;

function check(bool $ok, string $label): void
{
    global $failures;
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . "\n";
    if (!$ok) {
        $failures++;
    }
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

$root = sys_get_temp_dir() . '/reaction_claim_test_' . bin2hex(random_bytes(6));
mkdir($root, 0755, true);
$s = new BattleStorage($root);
$lobby = 'L1';
$game = 'g1';

// The host has completed tick 9 and is paused for the batch at tick 10.
$s->appendFingerprints($lobby, $game, [['tick' => 9, 'fp' => '1111111111111111', 'paused' => true]]);

// 1. Record: success, one finalized pending row, revision bumps.
$before = $s->getOrdersRevision($lobby, $game);
$r = AppendReactionClaimHandler::record($s, $lobby, $game, 'p2', 10, '10:3', 'unit_far');
check($r['success'] === true, 'a claim is recorded');
check($r['idHash'] === BattleStorage::reactionClaimIdHash('10:3', 'unit_far'), 'row id is deterministic');
check($s->getOrdersRevision($lobby, $game) > $before, 'recording bumps the orders revision');
$rows = $s->getOrdersRange($lobby, $game, null, null);
check(count($rows) === 1, 'one row in the stream');
check(($rows[0]['order']['reactionClaim']['planeId'] ?? null) === '10:3', 'the row carries the plane id');
check(($rows[0]['atTick'] ?? null) === 10 && ($rows[0]['playerId'] ?? null) === 'p2', 'row is at the plane tick for the claimant');
check(BattleStorage::isReactionClaimOrder($rows[0]['order']), 'row is recognised as a claim');

// 2. Idempotent.
$rev = $s->getOrdersRevision($lobby, $game);
$again = AppendReactionClaimHandler::record($s, $lobby, $game, 'p2', 10, '10:3', 'unit_far');
check($again['success'] === true, 'recording the same claim again still succeeds');
check(count($s->getOrdersRange($lobby, $game, null, null)) === 1, 'a repeat stays one row');
check($s->getOrdersRevision($lobby, $game) === $rev, 'a repeat keeps the revision');

// 3. The claimant's real order at the same tick does not replace the claim.
$s->appendOrder($lobby, $game, [
    'atTick' => 10,
    'playerId' => 'p2',
    'order' => ['unitId' => 'unit_far', 'abilityId' => 'wait', 'targets' => [], 'endTurn' => true],
    'idHash' => 'realOrder',
    'finalized' => true,
]);
$rows = $s->getOrdersRange($lobby, $game, null, null);
check(count($rows) === 2, 'claim and real order coexist for one unit and tick');

// 4. The batch merge moves both to applied.
$s->mergeFinalizedPendingForBatch($lobby, $game, 10);
$split = $s->getOrdersRangeSplit($lobby, $game, null, null);
check(count($split['pending']) === 0, 'nothing left pending after the merge');
$appliedClaims = array_filter($split['applied'], static fn(array $x): bool => BattleStorage::isReactionClaimOrder($x['order'] ?? null));
check(count($appliedClaims) === 1, 'the claim is in applied_orders after the merge');
check(count($split['applied']) === 2, 'the real order is applied too');

// 5. Past ticks are rejected like any order.
$s->appendFingerprints($lobby, $game, [['tick' => 20, 'fp' => 'abcdabcdabcdabcd', 'paused' => false]]);
$late = AppendReactionClaimHandler::record($s, $lobby, $game, 'p2', 12, '12:4', 'unit_far');
check($late['success'] === false && ($late['rejectedReason'] ?? '') === 'tick_in_past', 'a claim for a closed tick is a rejection');
check(count($s->getOrdersRange($lobby, $game, 12, 12)) === 0, 'a rejected claim writes nothing');

removeTree($root);
echo $failures === 0 ? "All checks passed\n" : "{$failures} check(s) failed\n";
exit($failures === 0 ? 0 : 1);
