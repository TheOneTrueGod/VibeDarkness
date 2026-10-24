<?php

namespace App;

/**
 * Player-created campaign character (stored in storage/characters/<id>.json).
 * Serializable for API and storage.
 */
class Character
{
    public const RESEARCH_SOURCE_PURCHASED = 'Purchased';
    public const RESEARCH_SOURCE_ADMIN = 'Admin';
    public const RESEARCH_SOURCE_QUEST_REWARD = 'QuestReward';

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
    /** @var array<string, array<string, list<string>>> treeId → nodeId → sources per level */
    private array $researchSources;
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
    /** Per-campaign location card decks. Key = campaignId, value = list of LocationCardInstance. */
    private array $locationDeck;
    /** Save-data schema version (see App\SaveData\CharacterMigrations). */
    private int $version;
    /** Fraction of max Hunger the character started with; legacy characters (no stored value) started full. */
    private float $startingHungerFraction;

    /** Starting Hunger fraction for newly created characters (the bar starts 30% full). Mirrors characterHunger.ts. */
    public const NEW_CHARACTER_STARTING_HUNGER_FRACTION = 0.3;

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
        array $lastMissionAbilityIds = [],
        array $researchSources = [],
        array $locationDeck = [],
        int $version = 0,
        float $startingHungerFraction = 1.0
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
        $this->researchSources = self::normalizeResearchSources($researchSources);
        $this->lastUsed = max(0, $lastUsed);
        $this->missionResults = is_array($missionResults) ? $missionResults : [];
        $this->questResults = is_array($questResults) ? $questResults : [];
        $this->activeQuestRun = $activeQuestRun;
        $this->lastMissionAbilityIds = self::normalizeStringIdList($lastMissionAbilityIds);
        $this->locationDeck = self::normalizeLocationDeck($locationDeck);
        $this->version = max(0, $version);
        $this->startingHungerFraction = max(0.0, min(1.0, $startingHungerFraction));
    }

    public function getStartingHungerFraction(): float
    {
        return $this->startingHungerFraction;
    }

    public function getVersion(): int
    {
        return $this->version;
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

    /** @return array<string, array<string, list<string>>> */
    public function getResearchSources(): array
    {
        return $this->researchSources;
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

    /**
     * Signed net hunger change (<= 0 normally) from this character's campaign mission and quest results.
     * Latest-per-mission sum plus only negative (loss) quest deltas.
     * Mirrors `getCharacterHungerDelta` in characterHunger.ts.
     */
    public function getHungerDelta(): int
    {
        $campaignId = $this->campaignId;
        $missionList = $this->missionResults[$campaignId] ?? [];
        $total = Campaign::sumLatestMissionResourceDeltas(is_array($missionList) ? $missionList : [])['hunger'];
        $quests = $this->questResults[$campaignId] ?? [];
        if (is_array($quests)) {
            foreach ($quests as $quest) {
                if (!is_array($quest)) {
                    continue;
                }
                $n = $quest['resourceDelta']['hunger'] ?? 0;
                if (is_numeric($n) && (int) $n < 0) {
                    $total += (int) $n;
                }
            }
        }
        return $total;
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

    /** @return array<string, list<array<string, mixed>>> */
    public function getLocationDeck(): array
    {
        return $this->locationDeck;
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

    /** @param array<string, array<string, list<string>>> $researchSources */
    public function setResearchSources(array $researchSources): void
    {
        $this->researchSources = self::normalizeResearchSources($researchSources);
    }

    public static function normalizeSource(string $source): string
    {
        if ($source === self::RESEARCH_SOURCE_ADMIN || $source === self::RESEARCH_SOURCE_QUEST_REWARD) {
            return $source;
        }
        return self::RESEARCH_SOURCE_PURCHASED;
    }

    /**
     * Add one level of a node. Returns false when already at max (or already present when max is 1).
     */
    public function addResearchLevel(string $treeId, string $nodeId, string $source, int $maxLevels = 1): bool
    {
        $source = self::normalizeSource($source);
        if ($maxLevels < 1) {
            $maxLevels = 1;
        }
        $list = $this->researchTrees[$treeId] ?? [];
        $list = is_array($list) ? $list : [];
        $treeLevels = is_array($this->researchNodeLevels[$treeId] ?? null) ? $this->researchNodeLevels[$treeId] : [];
        $currentLevel = (int) ($treeLevels[$nodeId] ?? 0);
        if ($currentLevel < 1 && in_array($nodeId, $list, true)) {
            $currentLevel = 1;
        }
        if ($currentLevel >= $maxLevels) {
            return false;
        }
        if (!in_array($nodeId, $list, true)) {
            $list[] = $nodeId;
        }
        $this->researchTrees[$treeId] = array_values(array_unique(array_map('strval', $list)));
        $nextLevel = $currentLevel + 1;
        $treeLevels[$nodeId] = $nextLevel;
        $this->researchNodeLevels[$treeId] = $treeLevels;

        $treeSources = is_array($this->researchSources[$treeId] ?? null) ? $this->researchSources[$treeId] : [];
        $nodeSources = is_array($treeSources[$nodeId] ?? null) ? $treeSources[$nodeId] : [];
        $cleanSources = [];
        foreach ($nodeSources as $entry) {
            if (is_string($entry) && ($entry === self::RESEARCH_SOURCE_ADMIN || $entry === self::RESEARCH_SOURCE_QUEST_REWARD || $entry === self::RESEARCH_SOURCE_PURCHASED)) {
                $cleanSources[] = $entry;
            }
        }
        while (count($cleanSources) < $currentLevel) {
            $cleanSources[] = self::RESEARCH_SOURCE_PURCHASED;
        }
        $cleanSources[] = $source;
        $treeSources[$nodeId] = $cleanSources;
        $this->researchSources[$treeId] = $treeSources;
        return true;
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
            'researchSources' => $this->researchSources,
            'lastUsed' => $this->lastUsed,
            'missionResults' => $this->missionResults,
            'questResults' => $this->questResults,
            'activeQuestRun' => $this->activeQuestRun,
            'lastMissionAbilityIds' => $this->lastMissionAbilityIds,
            'locationDeck' => $this->locationDeck,
            'version' => $this->version,
            'startingHungerFraction' => $this->startingHungerFraction,
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
        $researchSources = $data['researchSources'] ?? [];
        $missionResults = $data['missionResults'] ?? [];
        $questResults = $data['questResults'] ?? [];
        $activeQuestRun = null;
        if (array_key_exists('activeQuestRun', $data) && is_array($data['activeQuestRun'])) {
            $activeQuestRun = $data['activeQuestRun'];
        }
        $lastMissionAbilityIds = $data['lastMissionAbilityIds'] ?? [];
        $locationDeck = $data['locationDeck'] ?? [];
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
            is_array($lastMissionAbilityIds) ? $lastMissionAbilityIds : [],
            is_array($researchSources) ? $researchSources : [],
            is_array($locationDeck) ? $locationDeck : [],
            (int) ($data['version'] ?? 0),
            isset($data['startingHungerFraction']) && is_numeric($data['startingHungerFraction'])
                ? (float) $data['startingHungerFraction']
                : 1.0
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
     * @param mixed $researchSources
     * @return array<string, array<string, list<string>>>
     */
    private static function normalizeResearchSources(mixed $researchSources): array
    {
        if (!is_array($researchSources)) {
            return [];
        }
        $out = [];
        foreach ($researchSources as $treeId => $nodes) {
            if (!is_string($treeId) || $treeId === '' || !is_array($nodes)) {
                continue;
            }
            $treeOut = [];
            foreach ($nodes as $nodeId => $sources) {
                if (!is_string($nodeId) || $nodeId === '') {
                    continue;
                }
                $list = [];
                if (is_string($sources)) {
                    $sources = [$sources];
                }
                if (!is_array($sources)) {
                    continue;
                }
                foreach ($sources as $entry) {
                    if (!is_string($entry)) {
                        continue;
                    }
                    $list[] = self::normalizeSource($entry);
                }
                if ($list !== []) {
                    $treeOut[$nodeId] = array_values($list);
                }
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

    /**
     * Normalize location deck structure.
     * Per-campaign map where each value is a list of location card instances.
     * Each instance must have a string instanceId and int location_card_id.
     * @param mixed $deck
     * @return array<string, list<array<string, mixed>>>
     */
    private static function normalizeLocationDeck(mixed $deck): array
    {
        if (!is_array($deck)) {
            return [];
        }
        $out = [];
        foreach ($deck as $campaignId => $instances) {
            if (!is_string($campaignId) || $campaignId === '' || !is_array($instances)) {
                continue;
            }
            $campaignInstances = [];
            foreach ($instances as $instance) {
                if (!is_array($instance)) {
                    continue;
                }
                // Must have string instanceId and int location_card_id
                $instanceId = $instance['instanceId'] ?? null;
                $locationCardId = $instance['location_card_id'] ?? null;
                if (!is_string($instanceId) || $instanceId === '' || !is_int($locationCardId) || $locationCardId < 1) {
                    continue;
                }
                // Keep the full instance object, default modifications to empty array
                $cleanInstance = [
                    'instanceId' => $instanceId,
                    'location_card_id' => $locationCardId,
                ];
                if (isset($instance['displayNameOverride']) && is_string($instance['displayNameOverride'])) {
                    $cleanInstance['displayNameOverride'] = $instance['displayNameOverride'];
                }
                $modifications = [];
                if (isset($instance['modifications']) && is_array($instance['modifications'])) {
                    foreach ($instance['modifications'] as $mod) {
                        if (is_array($mod) && ($mod['type'] ?? null) === 'add_reward' && isset($mod['slot'], $mod['reward_id'])) {
                            if (is_int($mod['slot']) && is_int($mod['reward_id'])) {
                                $modifications[] = [
                                    'type' => 'add_reward',
                                    'slot' => $mod['slot'],
                                    'reward_id' => $mod['reward_id'],
                                ];
                            }
                        }
                    }
                }
                $cleanInstance['modifications'] = $modifications;
                $campaignInstances[] = $cleanInstance;
            }
            if ($campaignInstances !== []) {
                $out[$campaignId] = $campaignInstances;
            }
        }
        return $out;
    }
}
