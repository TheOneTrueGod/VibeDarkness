<?php

namespace App;

/**
 * Campaign - meta-progression across missions.
 * Stored separately from player data; account holds campaign IDs only.
 */
class Campaign
{
    /**
     * Every campaign resource key. The single source of truth: renaming or adding a resource starts here
     * (plus a data migration for stored saves).
     *
     * @var list<string>
     */
    public const RESOURCE_KEYS = ['vigor', 'metal', 'population', 'attunement', 'hunger'];

    /**
     * Resources that are signed penalty accumulators: clamped to <= 0 (min(0, x)) instead of >= 0 (max(0, x)).
     *
     * @var list<string>
     */
    private const SIGNED_RESOURCE_KEYS = ['hunger'];

    private string $id;
    private string $name;
    /** @var array<int, array{id: string, name: string, characterId: string}> */
    private array $campaignCharacters;
    /**
     * @var array<int, array{
     *   missionId: string,
     *   result: string,
     *   timestamp?: float,
     *   resourceDelta?: array<string, int>,
     *   itemIds?: array<int, string>,
     *   researchRewardIds?: array<int, string>,
     *   researchRewards?: array<int, array{treeId: string, nodeId: string}>
     * }>
     */
    private array $missionResults;
    /** @var array<string, int> keys are Campaign::RESOURCE_KEYS */
    private array $resources;
    /**
     * Active DarknessStrength instance crumbs (packageId + optional data).
     * @var array<int, array{packageId: string, data?: array<string, mixed>}>
     */
    private array $darknessStrengthInstances;
    /**
     * Admin force enable/disable overrides keyed by packageId.
     * @var array<string, array{enabled: bool, data?: array<string, mixed>}>
     */
    private array $adminDarknessStrengthOverrides;
    /**
     * Stub region map; full lord-domain content later.
     * @var array<string, array{activeDomainPackageIds?: array<int, string>}>
     */
    private array $regions;
    /**
     * Admin-granted global Darkness Upgrades (research-tree-shaped state).
     * @var array{researchTrees: array<string, mixed>, researchNodeLevels: array<string, mixed>, researchNodeSources: array<string, mixed>, sourceMissions: array<string, mixed>}
     */
    private array $darknessUpgrades;
    /**
     * Campaign-level equipment unlocks (deduplicated item ids). Unlocking twice is a no-op.
     * @var list<string>
     */
    private array $unlockedItemIds;
    /** Save-data schema version (see App\SaveData\CampaignMigrations). */
    private int $version;

    public function __construct(
        string $id,
        string $name = '',
        array $campaignCharacters = [],
        array $missionResults = [],
        array $resources = [],
        array $darknessStrengthInstances = [],
        array $adminDarknessStrengthOverrides = [],
        array $regions = [],
        array $darknessUpgrades = [],
        array $unlockedItemIds = [],
        int $version = 0
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->campaignCharacters = $campaignCharacters;
        $this->missionResults = $missionResults;
        $this->resources = array_merge(
            self::zeroResources(),
            $resources
        );
        $this->darknessStrengthInstances = self::normalizeDarknessStrengthInstances($darknessStrengthInstances);
        $this->adminDarknessStrengthOverrides = self::normalizeAdminDarknessStrengthOverrides($adminDarknessStrengthOverrides);
        $this->regions = self::normalizeRegions($regions);
        $this->darknessUpgrades = self::normalizeDarknessUpgrades($darknessUpgrades);
        $this->unlockedItemIds = self::normalizeItemIds($unlockedItemIds);
        $this->version = max(0, $version);
    }

    public function getVersion(): int
    {
        return $this->version;
    }

    /** @return list<string> */
    public function getUnlockedItemIds(): array
    {
        return $this->unlockedItemIds;
    }

    /**
     * Unlock equipment items for this campaign. Duplicates and blanks are ignored.
     *
     * @param array<int, mixed> $ids
     * @return bool true if anything changed
     */
    public function unlockItems(array $ids): bool
    {
        $merged = self::normalizeItemIds(array_merge($this->unlockedItemIds, $ids));
        if ($merged === $this->unlockedItemIds) {
            return false;
        }
        $this->unlockedItemIds = $merged;
        return true;
    }

    /**
     * Remove unlocked items (admin tooling).
     *
     * @param array<int, mixed> $ids
     * @return bool true if anything changed
     */
    public function relockItems(array $ids): bool
    {
        $remove = self::normalizeItemIds($ids);
        $kept = array_values(array_diff($this->unlockedItemIds, $remove));
        if ($kept === $this->unlockedItemIds) {
            return false;
        }
        $this->unlockedItemIds = $kept;
        return true;
    }

    /**
     * @param mixed $raw
     * @return list<string>
     */
    private static function normalizeItemIds($raw): array
    {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $id) {
            if (!is_string($id)) {
                continue;
            }
            $t = trim($id);
            if ($t !== '' && !in_array($t, $out, true)) {
                $out[] = $t;
            }
        }
        return $out;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
    }

    public function getCampaignCharacters(): array
    {
        return $this->campaignCharacters;
    }

    public function getMissionResults(): array
    {
        return $this->missionResults;
    }

    /** @return array<string, int> keys are Campaign::RESOURCE_KEYS */
    public function getResources(): array
    {
        return $this->resources;
    }

    public function setCampaignCharacters(array $campaignCharacters): void
    {
        $this->campaignCharacters = $campaignCharacters;
    }

    public function setMissionResults(array $missionResults): void
    {
        $this->missionResults = $missionResults;
    }

    public function setResources(array $resources): void
    {
        $this->resources = array_merge(
            self::zeroResources(),
            array_intersect_key($resources, array_flip(self::RESOURCE_KEYS))
        );
    }

    /** @return array<int, array{packageId: string, data?: array<string, mixed>}> */
    public function getDarknessStrengthInstances(): array
    {
        return $this->darknessStrengthInstances;
    }

    public function setDarknessStrengthInstances(array $instances): void
    {
        $this->darknessStrengthInstances = self::normalizeDarknessStrengthInstances($instances);
    }

    /** @return array<string, array{enabled: bool, data?: array<string, mixed>}> */
    public function getAdminDarknessStrengthOverrides(): array
    {
        return $this->adminDarknessStrengthOverrides;
    }

    public function setAdminDarknessStrengthOverrides(array $overrides): void
    {
        $this->adminDarknessStrengthOverrides = self::normalizeAdminDarknessStrengthOverrides($overrides);
    }

    /** @return array<string, array{activeDomainPackageIds?: array<int, string>}> */
    public function getRegions(): array
    {
        return $this->regions;
    }

    public function setRegions(array $regions): void
    {
        $this->regions = self::normalizeRegions($regions);
    }

    /** @return array{researchTrees: array<string, mixed>, researchNodeLevels: array<string, mixed>, researchNodeSources: array<string, mixed>} */
    public function getDarknessUpgrades(): array
    {
        return $this->darknessUpgrades;
    }

    public function setDarknessUpgrades(array $darknessUpgrades): void
    {
        $this->darknessUpgrades = self::normalizeDarknessUpgrades($darknessUpgrades);
    }

    /** Add or override a mission result. Only one result per mission; new result replaces existing. Does not add resources to campaign; use getEffectiveResources() for display. */
    public function addMissionResult(
        string $missionId,
        string $result,
        ?array $resourceDelta = null,
        ?array $itemIds = null,
        ?array $researchRewardIds = null,
        ?array $researchRewards = null,
        ?bool $controlledNpcs = null
    ): void {
        $entry = [
            'missionId' => $missionId,
            'result' => $result,
            'timestamp' => microtime(true),
        ];
        if ($controlledNpcs === true) {
            $entry['controlledNpcs'] = true;
        }
        if ($resourceDelta !== null) {
            $entry['resourceDelta'] = array_intersect_key(
                array_map('intval', $resourceDelta),
                array_flip(self::RESOURCE_KEYS)
            );
        }
        if ($itemIds !== null && is_array($itemIds)) {
            $filtered = array_values(
                array_filter(
                    array_map(static fn ($id) => is_string($id) ? trim($id) : '',
                        $itemIds
                    ),
                    static fn ($id): bool => $id !== ''
                )
            );
            if ($filtered !== []) {
                $entry['itemIds'] = $filtered;
                $this->unlockItems($filtered);
            }
        }
        if ($researchRewardIds !== null && is_array($researchRewardIds)) {
            $filteredResearch = array_values(
                array_filter(
                    array_map(static fn ($id) => is_string($id) ? trim($id) : '', $researchRewardIds),
                    static fn ($id): bool => $id !== ''
                )
            );
            if ($filteredResearch !== []) {
                $entry['researchRewardIds'] = $filteredResearch;
            }
        }
        if ($researchRewards !== null && is_array($researchRewards)) {
            $norm = [];
            foreach ($researchRewards as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $treeId = isset($row['treeId']) && is_string($row['treeId']) ? trim($row['treeId']) : '';
                $nodeId = isset($row['nodeId']) && is_string($row['nodeId']) ? trim($row['nodeId']) : '';
                if ($treeId !== '' && $nodeId !== '') {
                    $norm[] = ['treeId' => $treeId, 'nodeId' => $nodeId];
                }
            }
            if ($norm !== []) {
                $entry['researchRewards'] = $norm;
            }
        }
        $existingIndex = null;
        foreach ($this->missionResults as $i => $r) {
            if (($r['missionId'] ?? '') === $missionId) {
                $existingIndex = $i;
                break;
            }
        }
        if ($existingIndex !== null) {
            $this->missionResults[$existingIndex] = $entry;
        } else {
            $this->missionResults[] = $entry;
        }
    }

    /** Zero the admin/base pool so effective resources equal mission reward deltas only. */
    public function resetStoredResources(): void
    {
        $this->resources = self::zeroResources();
    }

    /** Effective resources = stored resources + sum of mission reward deltas. Used for display and research checks. */
    public function getEffectiveResources(): array
    {
        $deltas = self::sumLatestMissionResourceDeltas($this->missionResults);
        $out = [];
        foreach (self::RESOURCE_KEYS as $key) {
            $out[$key] = (int) ($this->resources[$key] ?? 0) + $deltas[$key];
        }
        return $out;
    }

    /**
     * Latest resourceDelta per missionId (highest timestamp wins), then summed.
     *
     * @param array<int, mixed> $missionResults
     * @return array<string, int> keys are Campaign::RESOURCE_KEYS
     */
    public static function sumLatestMissionResourceDeltas(array $missionResults): array
    {
        $out = self::zeroResources();
        $latestByMission = [];
        foreach ($missionResults as $r) {
            if (!is_array($r)) {
                continue;
            }
            $mid = $r['missionId'] ?? '';
            if ($mid === '') {
                continue;
            }
            $ts = $r['timestamp'] ?? 0;
            if (!isset($latestByMission[$mid]) || ($latestByMission[$mid]['timestamp'] ?? 0) <= $ts) {
                $latestByMission[$mid] = $r;
            }
        }
        foreach ($latestByMission as $r) {
            $delta = $r['resourceDelta'] ?? null;
            if (is_array($delta)) {
                foreach (self::RESOURCE_KEYS as $key) {
                    $out[$key] += (int) ($delta[$key] ?? 0);
                }
            }
        }
        return $out;
    }

    /**
     * Disk/API `resources` are effective (stored + mission deltas).
     * Recover the admin/base pool so getEffectiveResources() does not double-count on load.
     *
     * @param mixed $persisted
     * @param array<int, mixed> $missionResults
     * @return array<string, int> keys are Campaign::RESOURCE_KEYS
     */
    private static function storedResourcesFromPersistedEffective($persisted, array $missionResults): array
    {
        $effective = is_array($persisted) ? $persisted : [];
        $deltas = self::sumLatestMissionResourceDeltas($missionResults);
        $out = [];
        foreach (self::RESOURCE_KEYS as $key) {
            $out[$key] = self::clampResource($key, (int) ($effective[$key] ?? 0) - $deltas[$key]);
        }
        return $out;
    }

    /** Adjust resources by delta (can be negative). Floors each at 0 (signed keys cap at 0 instead). */
    public function adjustResources(array $resourceDelta): void
    {
        foreach (self::RESOURCE_KEYS as $key) {
            $this->resources[$key] = self::clampResource(
                $key,
                ($this->resources[$key] ?? 0) + (int) ($resourceDelta[$key] ?? 0)
            );
        }
    }

    /** max(0, x) for normal resources; min(0, x) for SIGNED_RESOURCE_KEYS. */
    private static function clampResource(string $key, int $value): int
    {
        return in_array($key, self::SIGNED_RESOURCE_KEYS, true) ? min(0, $value) : max(0, $value);
    }

    /**
     * A resources map with every Campaign::RESOURCE_KEYS entry at 0.
     *
     * @return array<string, int>
     */
    public static function zeroResources(): array
    {
        return array_fill_keys(self::RESOURCE_KEYS, 0);
    }

    /** API and storage array. resources = effective (stored + mission rewards). */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'campaignCharacters' => array_values($this->campaignCharacters),
            'missionResults' => array_values($this->missionResults),
            'resources' => $this->getEffectiveResources(),
            'darknessStrengthInstances' => array_values($this->darknessStrengthInstances),
            // Empty maps encode as {} (not []) for stable client defaults.
            'adminDarknessStrengthOverrides' => empty($this->adminDarknessStrengthOverrides)
                ? new \stdClass()
                : $this->adminDarknessStrengthOverrides,
            'regions' => empty($this->regions)
                ? new \stdClass()
                : $this->regions,
            'darknessUpgrades' => self::darknessUpgradesForJson($this->darknessUpgrades),
            'unlockedItemIds' => array_values($this->unlockedItemIds),
            'version' => $this->version,
        ];
    }

    public static function fromArray(array $data): self
    {
        $chars = $data['campaignCharacters'] ?? [];
        $results = is_array($data['missionResults'] ?? null) ? $data['missionResults'] : [];
        $res = self::storedResourcesFromPersistedEffective($data['resources'] ?? [], $results);
        $instances = $data['darknessStrengthInstances'] ?? [];
        $overrides = $data['adminDarknessStrengthOverrides'] ?? [];
        $regions = $data['regions'] ?? [];
        $darknessUpgrades = $data['darknessUpgrades'] ?? [];
        $unlocked = $data['unlockedItemIds'] ?? [];
        return new self(
            $data['id'],
            $data['name'] ?? '',
            is_array($chars) ? $chars : [],
            $results,
            $res,
            is_array($instances) ? $instances : [],
            is_array($overrides) ? $overrides : [],
            is_array($regions) ? $regions : [],
            is_array($darknessUpgrades) ? $darknessUpgrades : [],
            is_array($unlocked) ? $unlocked : [],
            (int) ($data['version'] ?? 0)
        );
    }

    /**
     * Unknown-safe: missing/invalid sub-maps become empty arrays.
     *
     * @param mixed $raw
     * @return array{researchTrees: array<string, mixed>, researchNodeLevels: array<string, mixed>, researchNodeSources: array<string, mixed>}
     */
    private static function normalizeDarknessUpgrades($raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $out = [];
        foreach (['researchTrees', 'researchNodeLevels', 'researchNodeSources', 'sourceMissions'] as $key) {
            $out[$key] = isset($raw[$key]) && is_array($raw[$key]) ? $raw[$key] : [];
        }
        // Optional list: absent (null) means "every owned upgrade selected"; [] means none selected.
        if (isset($raw['selectedNodeIds']) && is_array($raw['selectedNodeIds'])) {
            $out['selectedNodeIds'] = array_values(array_filter(
                $raw['selectedNodeIds'],
                static fn ($id) => is_string($id) && $id !== ''
            ));
        }
        return $out;
    }

    /**
     * Empty maps encode as {} (not []) so the client sees Record shapes.
     *
     * @param array<string, array<string, mixed>> $upgrades
     * @return array<string, mixed>
     */
    private static function darknessUpgradesForJson(array $upgrades): array
    {
        $out = [];
        foreach ($upgrades as $key => $map) {
            if ($key === 'selectedNodeIds') {
                $out[$key] = array_values($map); // list, so an empty selection stays []
                continue;
            }
            $out[$key] = empty($map) ? new \stdClass() : $map;
        }
        return $out;
    }

    /**
     * @param mixed $raw
     * @return array<int, array{packageId: string, data?: array<string, mixed>}>
     */
    private static function normalizeDarknessStrengthInstances($raw): array
    {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $row) {
            if (!is_array($row)) {
                continue;
            }
            $packageId = isset($row['packageId']) && is_string($row['packageId']) ? trim($row['packageId']) : '';
            if ($packageId === '') {
                continue;
            }
            $entry = ['packageId' => $packageId];
            if (isset($row['data']) && is_array($row['data'])) {
                $entry['data'] = $row['data'];
            }
            $out[] = $entry;
        }
        return $out;
    }

    /**
     * @param mixed $raw
     * @return array<string, array{enabled: bool, data?: array<string, mixed>}>
     */
    private static function normalizeAdminDarknessStrengthOverrides($raw): array
    {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $packageId => $row) {
            if (!is_string($packageId) || trim($packageId) === '' || !is_array($row)) {
                continue;
            }
            $entry = ['enabled' => (bool) ($row['enabled'] ?? false)];
            if (isset($row['data']) && is_array($row['data'])) {
                $entry['data'] = $row['data'];
            }
            $out[trim($packageId)] = $entry;
        }
        return $out;
    }

    /**
     * @param mixed $raw
     * @return array<string, array{activeDomainPackageIds?: array<int, string>}>
     */
    private static function normalizeRegions($raw): array
    {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $regionId => $row) {
            if (!is_string($regionId) || trim($regionId) === '' || !is_array($row)) {
                continue;
            }
            $entry = [];
            if (isset($row['activeDomainPackageIds']) && is_array($row['activeDomainPackageIds'])) {
                $ids = array_values(
                    array_filter(
                        array_map(
                            static fn ($id) => is_string($id) ? trim($id) : '',
                            $row['activeDomainPackageIds']
                        ),
                        static fn ($id): bool => $id !== ''
                    )
                );
                if ($ids !== []) {
                    $entry['activeDomainPackageIds'] = $ids;
                }
            }
            $out[trim($regionId)] = $entry;
        }
        return $out;
    }
}
