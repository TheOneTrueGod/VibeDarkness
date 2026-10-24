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
use App\Migrations\Versions\M0003EquipmentUpgradeRewards;
use App\Migrations\Versions\M0004WeaponsResearchTree;
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
    // Checks of a given save version migrate only up to that version; later versions have their own checks.
    $charTo = static fn (array $d, int $v): array => SaveMigrator::migrate($d, $v, CharacterMigrations::migrations());
    $campTo = static fn (array $d, int $v, callable $owners, callable $load): array =>
        SaveMigrator::migrate($d, $v, CampaignMigrations::migrations($owners, $load));
    $chip = $charTo([
        'id' => 'chip',
        'equipment' => ['004', '013'],
        'researchTrees' => ['crystal_rocks' => ['throw_rock', 'charged_rocks'], 'stick_sword' => ['swing_stick']],
    ], 3);
    $check('character: Chip 004+013 (+charged_rocks) -> 004+011', $chip['data']['equipment'] === ['004', '011'], json_encode($chip['data']['equipment']));
    $check('character: version 3, swap node removed, other research untouched', $chip['data']['version'] === 3 && $chip['data']['researchTrees']['crystal_rocks'] === ['throw_rock']
        && $chip['data']['researchTrees']['stick_sword'] === ['swing_stick']);
    $again = $charTo($chip['data'], 3);
    $check('character: idempotent', $again['changed'] === false && $again['data'] === $chip['data']);
    $shield = $charTo(['id' => 's', 'equipment' => ['004', '012'], 'researchTrees' => []], 3);
    $check('character: 012 -> 003', $shield['data']['equipment'] === ['004', '003']);
    $implied = $charTo([
        'id' => 'i',
        'equipment' => ['004'],
        'researchTrees' => ['stick_sword' => ['swing_stick'], 'tech_shield' => ['raise_shield']],
    ], 3);
    $check('character: weapon implied by first root node', $implied['data']['equipment'] === ['004', '002']);
    $quest = CharacterMigrations::migrate([
        'id' => 'q',
        'equipment' => ['004', '015'],
        'activeQuestRun' => ['runId' => 'r', 'questCharacter' => ['equipment' => ['004', '021', '002']]],
    ], 3);
    $check('character: quest snapshot mapped and deduped', $quest['data']['activeQuestRun']['questCharacter']['equipment'] === ['004', '002']);

    $hungerChar = $charTo([
        'id' => 'h',
        'version' => 1,
        'missionResults' => ['camp' => [
            ['missionId' => 'm1', 'result' => 'victory', 'resourceDelta' => ['food' => 2, 'exhaustion' => 12]],
            ['missionId' => 'm2', 'result' => 'victory', 'resourceDelta' => ['exhaustion' => 0]],
        ]],
        'questResults' => ['camp' => ['q1' => ['resourceDelta' => ['exhaustion' => 5]]]],
    ], 3);
    $hd = $hungerChar['data'];
    $check('character v2: mission exhaustion 12 -> hunger -12', ($hd['missionResults']['camp'][0]['resourceDelta'] ?? null) === ['food' => 2, 'hunger' => -12], json_encode($hd['missionResults']['camp'][0]['resourceDelta'] ?? null));
    $check('character v2: zero exhaustion key dropped', ($hd['missionResults']['camp'][1]['resourceDelta'] ?? null) === [], json_encode($hd['missionResults']['camp'][1]['resourceDelta'] ?? null));
    $check('character v2: quest exhaustion 5 -> hunger -5', ($hd['questResults']['camp']['q1']['resourceDelta'] ?? null) === ['hunger' => -5] && $hd['version'] === 3);

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
    $campaign = $campTo(
        ['id' => 'camp', 'missionResults' => [['missionId' => 'm1', 'result' => 'victory', 'itemIds' => ['013']]]],
        3,
        static fn (string $id): array => $id === 'camp' ? ['cA', 'cB', 'missing'] : [],
        static fn (string $id): ?array => $chars[$id] ?? null
    );
    $unlocked = $campaign['data']['unlockedItemIds'];
    sort($unlocked);
    $check('campaign: unlocked = {001, 003}', $unlocked === ['001', '003'], json_encode($unlocked));

    $hungerCamp = $campTo(
        ['id' => 'c', 'version' => 1, 'resources' => ['food' => 1, 'exhaustion' => 3],
            'missionResults' => [['missionId' => 'm1', 'resourceDelta' => ['exhaustion' => 4]]]],
        3,
        static fn (string $id): array => [],
        static fn (string $id): ?array => null
    );
    $hc = $hungerCamp['data'];
    $check('campaign v2: resources.exhaustion 3 -> hunger -3', ($hc['resources'] ?? null) === ['food' => 1, 'hunger' => -3], json_encode($hc['resources'] ?? null));
    $check('campaign v2: mission delta exhaustion 4 -> hunger -4', ($hc['missionResults'][0]['resourceDelta'] ?? null) === ['hunger' => -4] && $hc['version'] === 3);

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
        $check('0001: applied', $code === 0 && MigrationLedger::load($store)->currentVersion() === CharacterMigrations::CURRENT_VERSION);
        $check('0001: character migrated on disk', ($charDisk['equipment'] ?? null) === ['004', '001'] && ($charDisk['version'] ?? 0) === CharacterMigrations::CURRENT_VERSION);
        $check('0001: campaign migrated on disk', ($campDisk['unlockedItemIds'] ?? null) === ['001'] && ($campDisk['version'] ?? 0) === CampaignMigrations::CURRENT_VERSION,
            json_encode($campDisk['unlockedItemIds'] ?? null));
        $check('0001: storage override restored', StorageRoot::get() !== $store);
    } finally {
        StorageRoot::setOverride(null);
        removeDir($store);
    }

    // --- Migration 0003 (equipment upgrade rewards): pure logic ---------------------------------------
    $rocksChar = [
        'id' => 'r', 'version' => 2, 'equipment' => ['004', '001'],
        'researchTrees' => ['crystal_rocks' => ['throw_rock', 'charged_rocks', 'more_power', 'more_rock'], 'stick_sword' => ['swing_stick']],
        'researchNodeLevels' => ['crystal_rocks' => ['more_power' => 2, 'charged_rocks' => 1]],
        'researchSources' => ['crystal_rocks' => ['more_power' => ['mission:m1'], 'charged_rocks' => ['mission:m1']]],
        'activeQuestRun' => ['runId' => 'q', 'questCharacter' => ['equipment' => ['004', '001'], 'researchTrees' => ['crystal_rocks' => ['charged_rocks']]]],
    ];
    $rc = $charTo($rocksChar, 3)['data'];
    $check('0003 character: Rocks -> Charged Rocks in place', $rc['equipment'] === ['004', '011'], json_encode($rc['equipment']));
    $check('0003 character: quest snapshot equipment + research converted',
        $rc['activeQuestRun']['questCharacter']['equipment'] === ['004', '011']
        && $rc['activeQuestRun']['questCharacter']['researchTrees']['crystal_rocks'] === []);
    $check('0003 character: swap node removed, More Power / More Rock re-parented',
        $rc['researchTrees']['crystal_rocks'] === ['throw_rock']
        && $rc['researchTrees']['charged_rocks_item'] === ['more_power']
        && $rc['researchTrees']['thrown_weapons'] === ['more_rock'],
        json_encode($rc['researchTrees']));
    $check('0003 character: levels and sources preserved on the new tree',
        $rc['researchNodeLevels'] === ['charged_rocks_item' => ['more_power' => 2]]
        && $rc['researchSources'] === ['charged_rocks_item' => ['more_power' => ['mission:m1']]],
        json_encode([$rc['researchNodeLevels'], $rc['researchSources']]));
    $check('0003 character: idempotent', CharacterMigrations::convertSwapResearch($rc) === $rc);

    $shieldChar = $charTo([
        'id' => 's', 'version' => 2, 'equipment' => ['004', '003'],
        'researchTrees' => ['tech_shield' => ['raise_shield', 'crystal_embedded_shield', 'throwing_crystal_shield', 'extra_shields']],
    ], 3)['data'];
    $check('0003 character: Shield line highest tier wins (016)', $shieldChar['equipment'] === ['004', '016'], json_encode($shieldChar['equipment']));
    $check('0003 character: Strengthening Light moved to Crystal Shield tree',
        $shieldChar['researchTrees']['tech_shield'] === ['raise_shield']
        && $shieldChar['researchTrees']['crystal_shield_item'] === ['extra_shields']);

    $plainChar = ['id' => 'p', 'version' => 2, 'equipment' => ['004', '002'], 'researchTrees' => ['stick_sword' => ['swing_stick']]];
    $pc = $charTo($plainChar, 3)['data'];
    $check('0003 character: untouched character keeps equipment and research',
        $pc['equipment'] === ['004', '002'] && $pc['researchTrees'] === ['stick_sword' => ['swing_stick']] && $pc['version'] === 3);

    $tierCamp = $campTo(
        ['id' => 'tc', 'version' => 2, 'unlockedItemIds' => ['001'], 'missionResults' => [
            ['missionId' => 'dark_awakening', 'result' => 'victory'],
            ['missionId' => 'towards_the_light', 'result' => 'victory'],
            ['missionId' => 'cave_respite', 'result' => 'defeat'],
        ]],
        3,
        static fn (string $id): array => ['cS'],
        static fn (string $id): ?array => ['equipment' => ['004', '003'], 'researchTrees' => ['tech_shield' => ['throwing_crystal_shield']]]
    )['data']['unlockedItemIds'];
    sort($tierCamp);
    $check('0003 campaign: tiers 1+2 unlocked, tier 3 only via the equipped 016',
        $tierCamp === ['001', '002', '003', '011', '012', '013', '014', '015', '016'], json_encode($tierCamp));

    // --- Migration 0004 (one Weapons tree): pure logic ------------------------------------------------
    $wc = $charTo([
        'id' => 'w', 'version' => 3, 'equipment' => ['004', '011'],
        'researchTrees' => [
            'crystal_rocks' => ['throw_rock'], 'charged_rocks_item' => ['more_power'],
            'thrown_weapons' => ['thrown_weapons_root', 'more_rock'], 'earth' => ['earth_core'],
        ],
        'researchNodeLevels' => ['charged_rocks_item' => ['more_power' => 2], 'thrown_weapons' => ['more_rock' => 1]],
        'researchSources' => ['charged_rocks_item' => ['more_power' => ['Purchased']], 'thrown_weapons' => ['more_rock' => ['Admin']]],
        'activeQuestRun' => ['runId' => 'q', 'questCharacter' => ['researchTrees' => ['knives_item' => ['piercing_knives']]]],
        'missionResults' => ['camp' => [['missionId' => 'm', 'researchRewards' => [
            ['treeId' => 'stick_sword', 'nodeId' => 'swing_stick'], ['treeId' => 'earth', 'nodeId' => 'earth_core'],
        ]]]],
    ], 4)['data'];
    $check('0004 character: weapon trees merged into weapons, family root dropped, other trees untouched',
        $wc['researchTrees'] === ['earth' => ['earth_core'], 'weapons' => ['throw_rock', 'more_power', 'more_rock']],
        json_encode($wc['researchTrees']));
    $check('0004 character: levels and sources moved to weapons',
        $wc['researchNodeLevels'] === ['weapons' => ['more_power' => 2, 'more_rock' => 1]]
        && $wc['researchSources'] === ['weapons' => ['more_power' => ['Purchased'], 'more_rock' => ['Admin']]],
        json_encode([$wc['researchNodeLevels'], $wc['researchSources']]));
    $check('0004 character: quest snapshot merged',
        $wc['activeQuestRun']['questCharacter']['researchTrees'] === ['weapons' => ['piercing_knives']]);
    $check('0004 character: mission research rewards re-pointed',
        array_column($wc['missionResults']['camp'][0]['researchRewards'], 'treeId') === ['weapons', 'earth']);
    $check('0004 character: idempotent', CharacterMigrations::v3ToV4($wc) === $wc && $wc['version'] === 4);
    $wcamp = $campTo(
        ['id' => 'wc', 'version' => 3, 'missionResults' => [['researchRewards' => [['treeId' => 'crystal_rocks', 'nodeId' => 'more_rock']]]]],
        4,
        static fn (string $id): array => [],
        static fn (string $id): ?array => null
    )['data'];
    $check('0004 campaign: mission research rewards re-pointed',
        $wcamp['missionResults'][0]['researchRewards'][0]['treeId'] === 'weapons' && $wcamp['version'] === 4);

    // --- Migrations 0003 + 0004 end to end in a scratch storage dir -----------------------------------
    $store = makeTempDir('migrate_0003_');
    foreach (['accounts', 'characters', 'campaigns'] as $d) {
        mkdir($store . '/' . $d);
    }
    file_put_contents($store . '/accounts/1.json', json_encode([
        'id' => 1, 'name' => 'T', 'role' => 'player', 'campaignIds' => ['camp3'], 'characterIds' => ['c_rocks', 'c_shield', 'c_plain'],
    ]));
    file_put_contents($store . '/accounts/accounts_index.json', json_encode(['nextId' => 2, 'byName' => ['T' => 1]]));
    $v2 = ['version' => 2, 'ownerAccountId' => 1];
    file_put_contents($store . '/characters/c_rocks.json', json_encode($v2 + [
        'id' => 'c_rocks', 'equipment' => ['004', '001'],
        'researchTrees' => ['crystal_rocks' => ['throw_rock', 'charged_rocks', 'more_power']],
        'researchNodeLevels' => ['crystal_rocks' => ['more_power' => 2]],
    ]));
    file_put_contents($store . '/characters/c_shield.json', json_encode($v2 + [
        'id' => 'c_shield', 'equipment' => ['004', '003'],
        'researchTrees' => ['tech_shield' => ['raise_shield', 'throwing_crystal_shield']],
    ]));
    file_put_contents($store . '/characters/c_plain.json', json_encode($v2 + [
        'id' => 'c_plain', 'equipment' => ['004', '002'], 'researchTrees' => ['stick_sword' => ['swing_stick']],
    ]));
    file_put_contents($store . '/campaigns/camp3.json', json_encode([
        'id' => 'camp3', 'version' => 2, 'unlockedItemIds' => ['001', '002', '003'],
        'missionResults' => [['missionId' => 'dark_awakening', 'result' => 'victory'], ['missionId' => 'towards_the_light', 'result' => 'victory']],
    ]));
    $readDisk = static fn (string $rel): array => json_decode((string) file_get_contents($store . '/' . $rel), true);
    try {
        $code = (new MigrationRunner($store, MigrationRegistry::all(), $quiet))->migrate();
        $cr = $readDisk('characters/c_rocks.json');
        $cs = $readDisk('characters/c_shield.json');
        $cp = $readDisk('characters/c_plain.json');
        $cc = $readDisk('campaigns/camp3.json');
        $check('0003+0004: applied', $code === 0 && MigrationLedger::load($store)->currentVersion() === 4);
        $check('0003+0004: Rocks character -> Charged Rocks + More Power in the Weapons tree',
            $cr['equipment'] === ['004', '011'] && $cr['researchTrees'] === ['weapons' => ['throw_rock', 'more_power']]
            && $cr['researchNodeLevels']['weapons']['more_power'] === 2 && $cr['version'] === 4,
            json_encode($cr));
        $check('0003+0004: Shield character -> Charged Shield', $cs['equipment'] === ['004', '016'] && $cs['researchTrees']['weapons'] === ['raise_shield'], json_encode($cs));
        $check('0003+0004: plain character keeps equipment, research moves to weapons', $cp['equipment'] === ['004', '002'] && $cp['researchTrees'] === ['weapons' => ['swing_stick']] && $cp['version'] === 4);
        $unlockedDisk = $cc['unlockedItemIds'] ?? [];
        sort($unlockedDisk);
        $check('0003: campaign unlocks tier 1-2 items plus equipped 016',
            $unlockedDisk === ['001', '002', '003', '011', '012', '013', '014', '015', '016'] && ($cc['version'] ?? 0) === 4, json_encode($cc['unlockedItemIds'] ?? null));
        // Re-running up() on migrated data changes nothing (idempotent).
        $before = [json_encode($cr), json_encode($cs), json_encode($cc)];
        (new M0003EquipmentUpgradeRewards())->up(new MigrationContext($store, $quiet));
        (new M0004WeaponsResearchTree())->up(new MigrationContext($store, $quiet));
        $after = [json_encode($readDisk('characters/c_rocks.json')), json_encode($readDisk('characters/c_shield.json')), json_encode($readDisk('campaigns/camp3.json'))];
        $check('0003+0004: up() is idempotent', $before === $after);
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
