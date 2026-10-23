<?php

/**
 * Deploy-time data migrations (see backend/Migrations/).
 *
 * Usage:
 *   php backend/scripts/migrate.php              Apply all pending migrations (no-op when up to date).
 *   php backend/scripts/migrate.php --status     Show current version and each migration's state.
 *   php backend/scripts/migrate.php --dry-run    Describe what pending migrations would change.
 *   php backend/scripts/migrate.php --self-test  Run built-in checks in a temp dir (touches no real storage).
 *   --storage <dir>                              Storage root (default: <repo>/storage).
 *
 * Exit codes: 0 ok / up to date, 1 failure (nothing further applied), 2 bad arguments,
 * 3 another run holds the lock.
 *
 * Adding a migration:
 *  1. Create backend/Migrations/Versions/M<NNNN><Name>.php extending App\Migrations\Migration,
 *     with version() = previous latest + 1. Make up() idempotent; implement plan() for --dry-run.
 *  2. Append it to MigrationRegistry::all().
 *  3. Add checks to runSelfTest() below if it has pure logic worth pinning.
 *  4. Run --dry-run, then apply locally. `npm run deploy` applies it on the server.
 * Never edit a migration after it has shipped — add a new one.
 */

use App\Migrations\Migration;
use App\Migrations\MigrationContext;
use App\Migrations\MigrationLedger;
use App\Migrations\MigrationRegistry;
use App\Migrations\MigrationRunner;
use App\SaveData\CampaignMigrations;
use App\SaveData\CharacterMigrations;
use App\SaveData\SaveMigrator;
use App\SaveData\StorageRoot;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script must be run from CLI.\n");
    exit(1);
}

$rootDir = dirname(__DIR__, 2);
require_once $rootDir . '/vendor/autoload.php';

$mode = 'migrate';
$storage = $rootDir . '/storage';
$args = array_slice($argv, 1);
for ($i = 0; $i < count($args); $i++) {
    $a = $args[$i];
    if ($a === '--status' || $a === '--dry-run' || $a === '--self-test') {
        $mode = substr($a, 2);
    } elseif ($a === '--storage' && isset($args[$i + 1])) {
        $storage = $args[++$i];
    } else {
        fwrite(STDERR, "Unknown or incomplete argument: {$a}\n");
        exit(2);
    }
}
$storage = rtrim(str_replace('\\', '/', $storage), '/');

// ---------------------------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------------------------

/** Test double: records the order of `up()` calls in a shared log, optionally throws. */
final class FakeMigration extends Migration
{
    /** @var list<int> */
    public static array $calls = [];

    public function __construct(private int $v, private bool $fail = false)
    {
    }

    public function version(): int { return $this->v; }
    public function name(): string { return 'fake_' . $this->v; }
    public function description(): string { return 'fake'; }
    public function touchedDirs(): array { return ['data']; }
    public function plan(MigrationContext $context): array { return ["would run {$this->v}"]; }

    public function up(MigrationContext $context): void
    {
        self::$calls[] = $this->v;
        if ($this->fail) {
            throw new RuntimeException("boom {$this->v}");
        }
        file_put_contents($context->storageDir . '/data/v' . $this->v . '.txt', 'ok');
    }
}

function makeTempDir(string $prefix): string
{
    $dir = sys_get_temp_dir() . '/' . $prefix . bin2hex(random_bytes(4));
    mkdir($dir, 0755, true);
    return str_replace('\\', '/', $dir);
}

function removeDir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($dir);
}

function runSelfTest(): int
{
    $fail = 0;
    $check = static function (string $name, bool $ok, string $detail = '') use (&$fail): void {
        echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($ok || $detail === '' ? '' : " ({$detail})") . "\n";
        if (!$ok) {
            $fail++;
        }
    };
    $quiet = static function (string $line): void {
    };

    // --- Registry -----------------------------------------------------------------------------
    try {
        MigrationRegistry::validate(MigrationRegistry::all());
        $check('registry: shipped migrations are valid', true);
    } catch (\LogicException $e) {
        $check('registry: shipped migrations are valid', false, $e->getMessage());
    }
    try {
        MigrationRegistry::validate([new FakeMigration(1), new FakeMigration(3)]);
        $check('registry: rejects a version gap', false);
    } catch (\LogicException) {
        $check('registry: rejects a version gap', true);
    }

    // --- Runner -------------------------------------------------------------------------------
    $tmp = makeTempDir('migrate_runner_');
    mkdir($tmp . '/data');
    file_put_contents($tmp . '/data/original.txt', 'x');
    try {
        FakeMigration::$calls = [];
        $m1 = new FakeMigration(1);
        $m2 = new FakeMigration(2);
        $runner = new MigrationRunner($tmp, [$m1, $m2], $quiet);
        $check('runner: first run applies 1..2 in order', $runner->migrate() === 0 && FakeMigration::$calls === [1, 2], json_encode(FakeMigration::$calls));
        $ledger = MigrationLedger::load($tmp);
        $check('runner: ledger at version 2 with 2 entries', $ledger->currentVersion() === 2 && count($ledger->applied()) === 2);
        $check('runner: backup taken before each migration', is_file($tmp . '/' . $ledger->entryFor(1)['backupDir'] . '/data/original.txt'));

        $check('runner: second run is a no-op', $runner->migrate() === 0 && FakeMigration::$calls === [1, 2]);

        // A new migration ships: only it runs.
        $m3 = new FakeMigration(3);
        $runner3 = new MigrationRunner($tmp, [$m1, $m2, $m3], $quiet);
        $check('runner: only the new migration runs', $runner3->migrate() === 0 && FakeMigration::$calls === [1, 2, 3], json_encode(FakeMigration::$calls));

        // Failure stops the run and is not recorded; a fixed rerun resumes from it.
        $failing = new FakeMigration(4, true);
        $m5 = new FakeMigration(5);
        $check('runner: failure returns non-zero', (new MigrationRunner($tmp, [$m1, $m2, $m3, $failing, $m5], $quiet))->migrate() === 1);
        $check('runner: nothing after the failure runs', FakeMigration::$calls === [1, 2, 3, 4], json_encode(FakeMigration::$calls));
        $check('runner: failed migration not recorded', MigrationLedger::load($tmp)->currentVersion() === 3);
        $fixed = new FakeMigration(4);
        (new MigrationRunner($tmp, [$m1, $m2, $m3, $fixed, $m5], $quiet))->migrate();
        $check('runner: rerun resumes at the failed migration', array_slice(FakeMigration::$calls, -2) === [4, 5] && MigrationLedger::load($tmp)->currentVersion() === 5);

        // Code older than storage (rolled-back deploy) refuses to run.
        $check('runner: refuses when storage is ahead of code', (new MigrationRunner($tmp, [$m1], $quiet))->migrate() === 1);

        // Lock contention.
        $lock = fopen($tmp . '/' . MigrationLedger::DIR . '/migrate.lock', 'c');
        flock($lock, LOCK_EX);
        $check('runner: second concurrent run is refused', $runner->migrate() === MigrationRunner::EXIT_LOCKED);
        flock($lock, LOCK_UN);
        fclose($lock);

        // Dry run writes nothing.
        $dry = makeTempDir('migrate_dry_');
        mkdir($dry . '/data');
        (new MigrationRunner($dry, [new FakeMigration(1)], $quiet))->dryRun();
        $check('runner: dry run writes nothing', !is_file($dry . '/data/v1.txt') && !is_file($dry . '/' . MigrationLedger::DIR . '/' . MigrationLedger::FILE));
        removeDir($dry);
    } finally {
        removeDir($tmp);
    }

    // --- Save-data entity migrations (used by migration 0001 and on load) --------------------
    $chip = CharacterMigrations::migrate([
        'id' => 'chip',
        'equipment' => ['004', '013'],
        'researchTrees' => ['crystal_rocks' => ['throw_rock', 'charged_rocks'], 'stick_sword' => ['swing_stick']],
    ]);
    $check('character: Chip 004+013 -> 004+001', $chip['data']['equipment'] === ['004', '001'], json_encode($chip['data']['equipment']));
    $check('character: version 2, research untouched', $chip['data']['version'] === 2
        && $chip['data']['researchTrees']['stick_sword'] === ['swing_stick']);
    $again = CharacterMigrations::migrate($chip['data']);
    $check('character: idempotent', $again['changed'] === false && $again['data'] === $chip['data']);
    $shield = CharacterMigrations::migrate(['id' => 's', 'equipment' => ['004', '012'], 'researchTrees' => []]);
    $check('character: 012 -> 003', $shield['data']['equipment'] === ['004', '003']);
    $implied = CharacterMigrations::migrate([
        'id' => 'i',
        'equipment' => ['004'],
        'researchTrees' => ['stick_sword' => ['swing_stick'], 'tech_shield' => ['raise_shield']],
    ]);
    $check('character: weapon implied by first root node', $implied['data']['equipment'] === ['004', '002']);
    $quest = CharacterMigrations::migrate([
        'id' => 'q',
        'equipment' => ['004', '015'],
        'activeQuestRun' => ['runId' => 'r', 'questCharacter' => ['equipment' => ['004', '021', '002']]],
    ]);
    $check('character: quest snapshot mapped and deduped', $quest['data']['activeQuestRun']['questCharacter']['equipment'] === ['004', '002']);

    $hungerChar = CharacterMigrations::migrate([
        'id' => 'h',
        'version' => 1,
        'missionResults' => ['camp' => [
            ['missionId' => 'm1', 'result' => 'victory', 'resourceDelta' => ['food' => 2, 'exhaustion' => 12]],
            ['missionId' => 'm2', 'result' => 'victory', 'resourceDelta' => ['exhaustion' => 0]],
        ]],
        'questResults' => ['camp' => ['q1' => ['resourceDelta' => ['exhaustion' => 5]]]],
    ]);
    $hd = $hungerChar['data'];
    $check('character v2: mission exhaustion 12 -> hunger -12', ($hd['missionResults']['camp'][0]['resourceDelta'] ?? null) === ['food' => 2, 'hunger' => -12], json_encode($hd['missionResults']['camp'][0]['resourceDelta'] ?? null));
    $check('character v2: zero exhaustion key dropped', ($hd['missionResults']['camp'][1]['resourceDelta'] ?? null) === [], json_encode($hd['missionResults']['camp'][1]['resourceDelta'] ?? null));
    $check('character v2: quest exhaustion 5 -> hunger -5', ($hd['questResults']['camp']['q1']['resourceDelta'] ?? null) === ['hunger' => -5] && $hd['version'] === 2);

    $order = [];
    $r = SaveMigrator::migrate(['version' => 1], 3, [
        0 => static function (array $d) use (&$order): array { $order[] = 0; return $d; },
        1 => static function (array $d) use (&$order): array { $order[] = 1; return $d; },
        2 => static function (array $d) use (&$order): array { $order[] = 2; return $d; },
    ]);
    $check('save migrator: runs stored..current in order', $order === [1, 2] && $r['data']['version'] === 3);

    $chars = [
        'cA' => ['equipment' => ['004', '011'], 'researchTrees' => []],
        'cB' => ['equipment' => ['019'], 'researchTrees' => ['crystal_rocks' => ['throw_rock']]],
    ];
    $campaign = CampaignMigrations::migrate(
        ['id' => 'camp', 'missionResults' => [['missionId' => 'm1', 'result' => 'victory', 'itemIds' => ['013']]]],
        static fn (string $id): array => $id === 'camp' ? ['cA', 'cB', 'missing'] : [],
        static fn (string $id): ?array => $chars[$id] ?? null
    );
    $unlocked = $campaign['data']['unlockedItemIds'];
    sort($unlocked);
    $check('campaign: unlocked = {001, 003}', $unlocked === ['001', '003'], json_encode($unlocked));

    $hungerCamp = CampaignMigrations::migrate(
        ['id' => 'c', 'version' => 1, 'resources' => ['food' => 1, 'exhaustion' => 3],
            'missionResults' => [['missionId' => 'm1', 'resourceDelta' => ['exhaustion' => 4]]]],
        static fn (string $id): array => [],
        static fn (string $id): ?array => null
    );
    $hc = $hungerCamp['data'];
    $check('campaign v2: resources.exhaustion 3 -> hunger -3', ($hc['resources'] ?? null) === ['food' => 1, 'hunger' => -3], json_encode($hc['resources'] ?? null));
    $check('campaign v2: mission delta exhaustion 4 -> hunger -4', ($hc['missionResults'][0]['resourceDelta'] ?? null) === ['hunger' => -4] && $hc['version'] === 2);

    // --- Migration 0001 end to end in a scratch storage dir --------------------------------------
    $store = makeTempDir('migrate_0001_');
    foreach (['accounts', 'characters', 'campaigns'] as $d) {
        mkdir($store . '/' . $d);
    }
    file_put_contents($store . '/accounts/1.json', json_encode([
        'id' => 1, 'name' => 'T', 'role' => 'player', 'campaignIds' => ['camp1'], 'characterIds' => ['char_t'],
    ]));
    file_put_contents($store . '/accounts/accounts_index.json', json_encode(['nextId' => 2, 'byName' => ['T' => 1]]));
    file_put_contents($store . '/characters/char_t.json', json_encode([
        'id' => 'char_t', 'ownerAccountId' => 1, 'equipment' => ['004', '013'],
        'researchTrees' => ['crystal_rocks' => ['throw_rock']],
    ]));
    file_put_contents($store . '/campaigns/camp1.json', json_encode(['id' => 'camp1', 'missionResults' => []]));
    try {
        $code = (new MigrationRunner($store, MigrationRegistry::all(), $quiet))->migrate();
        $charDisk = json_decode((string) file_get_contents($store . '/characters/char_t.json'), true);
        $campDisk = json_decode((string) file_get_contents($store . '/campaigns/camp1.json'), true);
        $check('0001: applied', $code === 0 && MigrationLedger::load($store)->currentVersion() === 2);
        $check('0001: character migrated on disk', ($charDisk['equipment'] ?? null) === ['004', '001'] && ($charDisk['version'] ?? 0) === 2);
        $check('0001: campaign migrated on disk', ($campDisk['unlockedItemIds'] ?? null) === ['001'] && ($campDisk['version'] ?? 0) === 2,
            json_encode($campDisk['unlockedItemIds'] ?? null));
        $check('0001: storage override restored', StorageRoot::get() !== $store);
    } finally {
        StorageRoot::setOverride(null);
        removeDir($store);
    }

    echo $fail === 0 ? "Self-test passed.\n" : "Self-test FAILED ({$fail}).\n";
    return $fail === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------
// Dispatch (at the end so the self-test class above is declared first)
// ---------------------------------------------------------------------------------------------

if ($mode === 'self-test') {
    exit(runSelfTest());
}

try {
    $runner = new MigrationRunner($storage, MigrationRegistry::all());
    exit(match ($mode) {
        'status' => $runner->status(),
        'dry-run' => $runner->dryRun(),
        default => $runner->migrate(),
    });
} catch (\Throwable $e) {
    fwrite(STDERR, 'Migration error: ' . $e->getMessage() . "\n");
    exit(MigrationRunner::EXIT_FAILED);
}
