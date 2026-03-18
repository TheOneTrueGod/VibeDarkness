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
        array $researchTrees = []
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

    /** @param array<string, string[]> $researchTrees */
    public function setResearchTrees(array $researchTrees): void
    {
        $this->researchTrees = self::normalizeResearchTrees($researchTrees);
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
        ];
    }

    public static function fromArray(array $data): self
    {
        $equipment = $data['equipment'] ?? [];
        $knowledge = $data['knowledge'] ?? [];
        $traits = $data['traits'] ?? [];
        $battleChipDetails = $data['battleChipDetails'] ?? [];
        $researchTrees = $data['researchTrees'] ?? [];
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
            is_array($researchTrees) ? $researchTrees : []
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
}
