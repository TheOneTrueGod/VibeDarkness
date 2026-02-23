<?php

namespace App;

/**
 * Static NPC definitions for level events and chat messages.
 * Each NPC has an id, name, and color used when displaying their messages.
 */
class NpcRegistry
{
    /** @var array<string, array{id: string, name: string, color: string}> */
    private static array $npcs = [
        '1' => [
            'id' => '1',
            'name' => 'Narrator',
            'color' => '#2563eb',
        ],
    ];

    public static function get(string $npcId): ?array
    {
        return self::$npcs[$npcId] ?? null;
    }
}
