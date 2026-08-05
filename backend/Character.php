<?php

namespace App;

/**
 * Player-created campaign character (stored in storage/characters/<id>.json).
 * Serializable for API and storage.
 */
class Character
{
    private string $id;
    private int $ownerAccountId;
    private string $name;
    /** @var string[] */
    private array $equipment;
    /** @var array<string, array<string, mixed>> */
    private array $knowledge;
    /** @var string[] */
    private array $traits;
    private string $portraitId;
    /** @var array<string, mixed> */
    private array $battleChipDetails;
    private string $campaignId;
    private string $missionId;
    /** @var array<string, string[]> */
    private array $researchTrees;
    /** @var array<string, array<string, int>> treeId → nodeId → level */
    private array $researchNodeLevels;
    /** Unix timestamp when this character last started a mission (playable unit). 0 = never. */
    private int $lastUsed;
    /** Per-campaign mission results. Key = campaignId, value = list of MissionResult objects. */
    private array $missionResults;
    /** Per-campaign quest results. Key = campaignId, value = list of QuestResult objects. */
    private array $questResults;
    /** Active QuestRunState blob (includes questCharacter), or null when none. */
    private ?array $activeQuestRun;
    /** @var string[] Last Prepare Carefully primary ability picks for regular missions. */
    private array $lastMissionAbilityIds;

    public function __construct(
        string $id,
        int $ownerAccountId,
        string $name = '',
        array $equipment = [],
        array $knowledge = [],
        array $traits = [],
        string $portraitId = '',
        array $battleChipDetails = [],
        string $campaignId = '',
        string $missionId = '',
        array $researchTrees = [],
        int $lastUsed = 0,
        array $missionResults = [],
        array $researchNodeLevels = [],
        array $questResults = [],
        ?array $activeQuestRun = null,
        array $lastMissionAbilityIds = []
    ) {
        $this->id = $id;
        $this->ownerAccountId = $ownerAccountId;
        $this->name = $name;
        $this->equipment = array_values($equipment);
        $this->knowledge = $knowledge;
        $this->traits = array_values($traits);
        $this->portraitId = $portraitId;
        $this->battleChipDetails = $battleChipDetails;
        $this->campaignId = $campaignId;
        $this->missionId = $missionId;
        $this->researchTrees = self::normalizeResearchTrees($researchTrees);
        $this->researchNodeLevels = self::normalizeResearchNodeLevels($researchNodeLevels);
        $this->lastUsed = max(0, $lastUsed);
        $this->missionResults = is_array($missionResults) ? $missionResults : [];
        $this->questResults = is_array($questResults) ? $questResults : [];
        $this->activeQuestRun = $activeQuestRun;
        $this->lastMissionAbilityIds = self::normalizeStringIdList($lastMissionAbilityIds);
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getOwnerAccountId(): int
    {
        return $this->ownerAccountId;
    }

    public function getName(): string
    {
        return $this->name;
    }

    /** @return string[] */
    public function getEquipment(): array
    {
        return $this->equipment;
    }

    /** @return array<string, array<string, mixed>> */
    public function getKnowledge(): array
    {
        return $this->knowledge;
    }

    /** @return string[] */
    public function getTraits(): array
    {
        return $this->traits;
    }

    public function getPortraitId(): string
    {
        return $this->portraitId;
    }

    /** @return array<string, mixed> */
    public function getBattleChipDetails(): array
    {
        return $this->battleChipDetails;
    }

    public function getCampaignId(): string
    {
        return $this->campaignId;
    }

    public function getMissionId(): string
    {
        return $this->missionId;
    }

    /** @return array<string, string[]> */
    public function getResearchTrees(): array
    {
        return $this->researchTrees;
    }

    /** @return array<string, array<string, int>> */
    public function getResearchNodeLevels(): array
    {
        return $this->researchNodeLevels;
    }

    public function getLastUsed(): int
    {
        return $this->lastUsed;
    }

    /** @return array<string, list<array<string, mixed>>> */
    public function getMissionResults(): array
    {
        return $this->missionResults;
    }

    /** @return array<string, list<array<string, mixed>>> */
    public function getQuestResults(): array
    {
        return $this->questResults;
    }

    /** @return array<string, mixed>|null */
    public function getActiveQuestRun(): ?array
    {
        return $this->activeQuestRun;
    }

    /** @return string[] */
    public function getLastMissionAbilityIds(): array
    {
        return $this->lastMissionAbilityIds;
    }

    /** @param array<string, string[]> $researchTrees */
    public function setResearchTrees(array $researchTrees): void
    {
        $this->researchTrees = self::normalizeResearchTrees($researchTrees);
    }

    /** @param array<string, array<string, int>> $researchNodeLevels */
    public function setResearchNodeLevels(array $researchNodeLevels): void
    {
        $this->researchNodeLevels = self::normalizeResearchNodeLevels($researchNodeLevels);
    }

    /** API and storage array (serializable) */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'ownerAccountId' => $this->ownerAccountId,
            'name' => $this->name,
            'equipment' => $this->equipment,
            'knowledge' => $this->knowledge,
            'traits' => $this->traits,
            'portraitId' => $this->portraitId,
            'battleChipDetails' => $this->battleChipDetails,
            'campaignId' => $this->campaignId,
            'missionId' => $this->missionId,
            'researchTrees' => $this->researchTrees,
            'researchNodeLevels' => $this->researchNodeLevels,
            'lastUsed' => $this->lastUsed,
            'missionResults' => $this->missionResults,
            'questResults' => $this->questResults,
            'activeQuestRun' => $this->activeQuestRun,
            'lastMissionAbilityIds' => $this->lastMissionAbilityIds,
        ];
    }

    public static function fromArray(array $data): self
    {
        $equipment = $data['equipment'] ?? [];
        $knowledge = $data['knowledge'] ?? [];
        $traits = $data['traits'] ?? [];
        $battleChipDetails = $data['battleChipDetails'] ?? [];
        $researchTrees = $data['researchTrees'] ?? [];
        $researchNodeLevels = $data['researchNodeLevels'] ?? [];
        $missionResults = $data['missionResults'] ?? [];
        $questResults = $data['questResults'] ?? [];
        $activeQuestRun = null;
        if (array_key_exists('activeQuestRun', $data) && is_array($data['activeQuestRun'])) {
            $activeQuestRun = $data['activeQuestRun'];
        }
        $lastMissionAbilityIds = $data['lastMissionAbilityIds'] ?? [];
        return new self(
            $data['id'] ?? '',
            (int) ($data['ownerAccountId'] ?? 0),
            (string) ($data['name'] ?? ''),
            is_array($equipment) ? array_values($equipment) : [],
            is_array($knowledge) ? $knowledge : [],
            is_array($traits) ? array_values($traits) : [],
            (string) ($data['portraitId'] ?? ''),
            is_array($battleChipDetails) ? $battleChipDetails : [],
            (string) ($data['campaignId'] ?? ''),
            (string) ($data['missionId'] ?? ''),
            is_array($researchTrees) ? $researchTrees : [],
            (int) ($data['lastUsed'] ?? 0),
            is_array($missionResults) ? $missionResults : [],
            is_array($researchNodeLevels) ? $researchNodeLevels : [],
            is_array($questResults) ? $questResults : [],
            $activeQuestRun,
            is_array($lastMissionAbilityIds) ? $lastMissionAbilityIds : []
        );
    }

    /**
     * @param mixed $researchTrees
     * @return array<string, string[]>
     */
    private static function normalizeResearchTrees(mixed $researchTrees): array
    {
        if (!is_array($researchTrees)) {
            return [];
        }
        $out = [];
        foreach ($researchTrees as $treeId => $nodeIds) {
            if (!is_string($treeId) || $treeId === '') {
                continue;
            }
            if (!is_array($nodeIds)) {
                continue;
            }
            $clean = [];
            foreach ($nodeIds as $nid) {
                $nid = is_string($nid) ? trim($nid) : '';
                if ($nid === '') {
                    continue;
                }
                $clean[] = $nid;
            }
            $out[$treeId] = array_values(array_unique($clean));
        }
        return $out;
    }

    /**
     * @param mixed $researchNodeLevels
     * @return array<string, array<string, int>>
     */
    private static function normalizeResearchNodeLevels(mixed $researchNodeLevels): array
    {
        if (!is_array($researchNodeLevels)) {
            return [];
        }
        $out = [];
        foreach ($researchNodeLevels as $treeId => $levels) {
            if (!is_string($treeId) || $treeId === '' || !is_array($levels)) {
                continue;
            }
            $treeOut = [];
            foreach ($levels as $nodeId => $level) {
                if (!is_string($nodeId) || $nodeId === '') {
                    continue;
                }
                $levelInt = (int) $level;
                if ($levelInt < 1) {
                    continue;
                }
                $treeOut[$nodeId] = $levelInt;
            }
            if ($treeOut !== []) {
                $out[$treeId] = $treeOut;
            }
        }
        return $out;
    }

    /**
     * @param mixed $ids
     * @return string[]
     */
    private static function normalizeStringIdList(mixed $ids): array
    {
        if (!is_array($ids)) {
            return [];
        }
        $clean = [];
        foreach ($ids as $id) {
            $id = is_string($id) ? trim($id) : '';
            if ($id === '') {
                continue;
            }
            $clean[] = $id;
        }
        return array_values(array_unique($clean));
    }
}
