<?php

namespace App;

/**
 * Creates the first campaign character for an account (new campaign / new account).
 * Storyline id and default equipment match CreateCharacterHandler / frontend CharacterCreator.
 */
class StarterCharacterFactory
{
    /** Must match WorldOfDarknessStoryline.id */
    public const DEFAULT_STORYLINE_ID = 'world_of_darkness';

    /** Must match WorldOfDarknessStoryline.startMissionId */
    public const DEFAULT_MISSION_ID = 'dark_awakening';

    /** Must match CHARACTER_NAMES in characterNames.ts */
    private const CHARACTER_NAMES = [
        'Aldric', 'Aria', 'Bram', 'Coral', 'Dax', 'Elara', 'Finn', 'Gwen',
        'Hugo', 'Ivy', 'Jasper', 'Kira', 'Leo', 'Mira', 'Nolan', 'Orin',
        'Piper', 'Quinn', 'Raven', 'Sage', 'Tobin', 'Uma', 'Vance', 'Willow',
        'Xander', 'Yara', 'Zephyr', 'Ash', 'Blair', 'Cove', 'Dusk', 'Ember',
        'Flint', 'Gale', 'Haven', 'Jade', 'Kestrel', 'Luna', 'Moss', 'Nova',
    ];

    /**
     * Default equipment when creating a new character (when client sends empty equipment).
     *
     * @return list<string>
     */
    public static function defaultEquipmentForCampaign(string $campaignId): array
    {
        if ($campaignId === 'bunker_at_the_end') {
            return ['006', '007', '008', '009'];
        }
        return ['004'];
    }

    public static function create(int $ownerAccountId): Character
    {
        $portraitId = PortraitCatalog::pickRandomAllowedPortraitId($ownerAccountId);
        return CharacterManager::getInstance()->createCharacter($ownerAccountId, [
            'name' => self::randomName(),
            'equipment' => self::defaultEquipmentForCampaign(self::DEFAULT_STORYLINE_ID),
            'knowledge' => [],
            'traits' => [],
            'portraitId' => $portraitId,
            'battleChipDetails' => [],
            'campaignId' => self::DEFAULT_STORYLINE_ID,
            'missionId' => self::DEFAULT_MISSION_ID,
        ]);
    }

    public static function randomName(): string
    {
        return self::CHARACTER_NAMES[array_rand(self::CHARACTER_NAMES)];
    }
}
