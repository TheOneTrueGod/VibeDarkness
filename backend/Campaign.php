<?php

namespace App;

/**
 * Campaign - meta-progression across missions.
 * Stored separately from player data; account holds campaign IDs only.
 */
class Campaign
{
    private string $id;
    private string $name;
    /** @var array<int, array{id: string, name: string, characterId: string}> */
    private array $campaignCharacters;
    /**
     * @var array<int, array{
     *   missionId: string,
     *   result: string,
     *   timestamp?: float,
     *   resourceDelta?: array{food?: int, metal?: int, population?: int, crystals?: int},
     *   itemIds?: array<int, string>,
     *   researchRewardIds?: array<int, string>,
     *   researchRewards?: array<int, array{treeId: string, nodeId: string}>
     * }>
     */
    private array $missionResults;
    /** @var array{food: int, metal: int, population: int, crystals: int} */
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

    public function __construct(
        string $id,
        string $name = '',
        array $campaignCharacters = [],
        array $missionResults = [],
        array $resources = [],
        array $darknessStrengthInstances = [],
        array $adminDarknessStrengthOverrides = [],
        array $regions = []
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->campaignCharacters = $campaignCharacters;
        $this->missionResults = $missionResults;
        $this->resources = array_merge(
            ['food' => 0, 'metal' => 0, 'population' => 0, 'crystals' => 0],
            $resources
        );
        $this->darknessStrengthInstances = self::normalizeDarknessStrengthInstances($darknessStrengthInstances);
        $this->adminDarknessStrengthOverrides = self::normalizeAdminDarknessStrengthOverrides($adminDarknessStrengthOverrides);
        $this->regions = self::normalizeRegions($regions);
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

    /** @return array{food: int, metal: int, population: int, crystals: int} */
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
            ['food' => 0, 'metal' => 0, 'population' => 0, 'crystals' => 0],
            array_intersect_key($resources, array_flip(['food', 'metal', 'population', 'crystals']))
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
                array_flip(['food', 'metal', 'population', 'crystals'])
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

    /** Effective resources = stored resources + sum of mission reward deltas. Used for display and research checks. */
    public function getEffectiveResources(): array
    {
        $out = [
            'food' => (int) ($this->resources['food'] ?? 0),
            'metal' => (int) ($this->resources['metal'] ?? 0),
            'population' => (int) ($this->resources['population'] ?? 0),
            'crystals' => (int) ($this->resources['crystals'] ?? 0),
        ];
        $latestByMission = [];
        foreach ($this->missionResults as $r) {
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
                $out['food'] += (int) ($delta['food'] ?? 0);
                $out['metal'] += (int) ($delta['metal'] ?? 0);
                $out['population'] += (int) ($delta['population'] ?? 0);
                $out['crystals'] += (int) ($delta['crystals'] ?? 0);
            }
        }
        return $out;
    }

    /** Adjust resources by delta (can be negative). Floors each at 0. */
    public function adjustResources(array $resourceDelta): void
    {
        $this->resources['food'] = max(0, ($this->resources['food'] ?? 0) + (int) ($resourceDelta['food'] ?? 0));
        $this->resources['metal'] = max(0, ($this->resources['metal'] ?? 0) + (int) ($resourceDelta['metal'] ?? 0));
        $this->resources['population'] = max(0, ($this->resources['population'] ?? 0) + (int) ($resourceDelta['population'] ?? 0));
        $this->resources['crystals'] = max(0, ($this->resources['crystals'] ?? 0) + (int) ($resourceDelta['crystals'] ?? 0));
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
        ];
    }

    public static function fromArray(array $data): self
    {
        $chars = $data['campaignCharacters'] ?? [];
        $results = $data['missionResults'] ?? [];
        $res = $data['resources'] ?? [];
        $instances = $data['darknessStrengthInstances'] ?? [];
        $overrides = $data['adminDarknessStrengthOverrides'] ?? [];
        $regions = $data['regions'] ?? [];
        return new self(
            $data['id'],
            $data['name'] ?? '',
            is_array($chars) ? $chars : [],
            is_array($results) ? $results : [],
            is_array($res) ? $res : [],
            is_array($instances) ? $instances : [],
            is_array($overrides) ? $overrides : [],
            is_array($regions) ? $regions : []
        );
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
