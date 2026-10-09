# Character Defs

Playable character data, portraits, the item registry, and the loadout resolver that decides which abilities a character brings to a battle.

| Path | Owns |
|------|------|
| `items/` | Item registry (hands, weapons, cores), icons, and the campaign-unlock helper. |
| `portraits/`, `portraits.ts` | Portrait art and registry. |
| `CampaignCharacter.ts`, `campaignCharacterTypes.ts` | Serializable campaign character shape and its class. |
| `characterLoadout.ts` | `resolveCharacterLoadout` and the per-player active-research helpers. |

## Equipment and research

Equipment grants abilities; research only modifies them (adds or replaces cards, modifiers, passives). Research never grants equipment, except core swaps. Weapon research trees are bound to their weapon and are ignored while it is not equipped.

`resolveCharacterLoadout` in `characterLoadout.ts` is the **only** place that turns equipment and research into abilities. Battle setup (`storylines/BaseMissionDef.ts`), Quest Prep (`storylines/questPrepLoadout.ts`), the Character Editor and the AbilityTest harness all call it; do not rebuild ability lists elsewhere. Details: the **research-trees** and **campaign-characters** skills.
