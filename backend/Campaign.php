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
    /** @var array<int, array{missionId: string, result: string, timestamp?: float}> */
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

    /** Add a mission result and optionally update resources. */
    public function addMissionResult(string $missionId, string $result, ?array $resourceDelta = null): void
    {
        $this->missionResults[] = [
            'missionId' => $missionId,
            'result' => $result,
            'timestamp' => microtime(true),
        ];
        if ($resourceDelta !== null) {
            $this->resources['food'] = max(0, ($this->resources['food'] ?? 0) + (int) ($resourceDelta['food'] ?? 0));
            $this->resources['metal'] = max(0, ($this->resources['metal'] ?? 0) + (int) ($resourceDelta['metal'] ?? 0));
            $this->resources['population'] = max(0, ($this->resources['population'] ?? 0) + (int) ($resourceDelta['population'] ?? 0));
            $this->resources['crystals'] = max(0, ($this->resources['crystals'] ?? 0) + (int) ($resourceDelta['crystals'] ?? 0));
        }
    }

    /** Adjust resources by delta (can be negative). Floors each at 0. */
    public function adjustResources(array $resourceDelta): void
    {
        $this->resources['food'] = max(0, ($this->resources['food'] ?? 0) + (int) ($resourceDelta['food'] ?? 0));
        $this->resources['metal'] = max(0, ($this->resources['metal'] ?? 0) + (int) ($resourceDelta['metal'] ?? 0));
        $this->resources['population'] = max(0, ($this->resources['population'] ?? 0) + (int) ($resourceDelta['population'] ?? 0));
        $this->resources['crystals'] = max(0, ($this->resources['crystals'] ?? 0) + (int) ($resourceDelta['crystals'] ?? 0));
    }

    /** API and storage array */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'campaignCharacters' => array_values($this->campaignCharacters),
            'missionResults' => array_values($this->missionResults),
            'resources' => $this->resources,
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
