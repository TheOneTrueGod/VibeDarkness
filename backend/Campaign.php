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
    /** @var array<int, array{missionId: string, result: string, timestamp?: float, resourceDelta?: array{food?: int, metal?: int, population?: int, crystals?: int}, itemIds?: array<int, string>}> */
    private array $missionResults;
    /** @var array{food: int, metal: int, population: int, crystals: int} */
    private array $resources;

    public function __construct(
        string $id,
        string $name = '',
        array $campaignCharacters = [],
        array $missionResults = [],
        array $resources = []
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->campaignCharacters = $campaignCharacters;
        $this->missionResults = $missionResults;
        $this->resources = array_merge(
            ['food' => 0, 'metal' => 0, 'population' => 0, 'crystals' => 0],
            $resources
        );
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

    /** Add or override a mission result. Only one result per mission; new result replaces existing. Does not add resources to campaign; use getEffectiveResources() for display. */
    public function addMissionResult(string $missionId, string $result, ?array $resourceDelta = null, ?array $itemIds = null): void
    {
        $entry = [
            'missionId' => $missionId,
            'result' => $result,
            'timestamp' => microtime(true),
        ];
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
        foreach ($this->missionResults as $r) {
            $delta = $r['resourceDelta'] ?? null;
            if (is_array($delta)) {
                $out['food'] = max(0, $out['food'] + (int) ($delta['food'] ?? 0));
                $out['metal'] = max(0, $out['metal'] + (int) ($delta['metal'] ?? 0));
                $out['population'] = max(0, $out['population'] + (int) ($delta['population'] ?? 0));
                $out['crystals'] = max(0, $out['crystals'] + (int) ($delta['crystals'] ?? 0));
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
        ];
    }

    public static function fromArray(array $data): self
    {
        $chars = $data['campaignCharacters'] ?? [];
        $results = $data['missionResults'] ?? [];
        $res = $data['resources'] ?? [];
        return new self(
            $data['id'],
            $data['name'] ?? '',
            is_array($chars) ? $chars : [],
            is_array($results) ? $results : [],
            is_array($res) ? $res : []
        );
    }
}
