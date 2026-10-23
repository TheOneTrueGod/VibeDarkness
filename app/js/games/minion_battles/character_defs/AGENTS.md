# Character Defs

Playable character data, portraits, the item registry, and the loadout resolver that decides which abilities a character brings to a battle.

| Path | Owns |
|------|------|
| `items/` | Item registry (hands, weapons, cores), icons, and the campaign-unlock helper. |
| `portraits/`, `portraits.ts` | Portrait art and registry. |
| `CampaignCharacter.ts`, `campaignCharacterTypes.ts` | Serializable campaign character shape and its class. |
| `characterLoadout.ts` | `resolveCharacterLoadout` and the per-player active-research helpers. |

## Equipment and research

Equipment grants abilities; research only modifies them (adds or replaces cards, modifiers, passives). Research never grants equipment, except core swaps. Weapon research trees are bound to their weapon item(s) and are ignored while none is equipped.

### Item tiers and upgrade paths

`ItemDef` has `tier`, `upgradesFrom` (the item it upgrades) and `campaignIds` (which campaign's tier unlocks may sweep it in), plus `roundStartRecoveryCharges` (an item passive, e.g. Charged Rocks' +1 Light Charge each round; copied onto the unit in `BaseMissionDef`, applied by `GameEngine`). World of Darkness weapons: tier 1 Rocks `001` / Stick `002` / Shield `003`; tier 2 Charged Rocks `011` and Knives `012` (from Rocks), Sword `013` and Mace `014` (from Stick), Crystal Shield `015` (from Shield); tier 3 Charged Shield `016` (from `015`). `items/itemUpgrades.ts` has the pure helpers `getItemUpgradesFor` and `getItemsForTier`.

Weapon upgrades are **items** delivered by mission rewards: `completionRewards.unlockItemTiers` unlocks every item of a slot and tier for the mission's campaign, and the `{ kind: 'equipmentUpgrade' }` research reward slot offers one `equip_item` row per upgrade of the currently equipped item (the equip replaces the old item).

`resolveCharacterLoadout` in `characterLoadout.ts` is the **only** place that turns equipment and research into abilities. Battle setup (`storylines/BaseMissionDef.ts`), Quest Prep (`storylines/questPrepLoadout.ts`), the Character Editor and the AbilityTest harness all call it; do not rebuild ability lists elsewhere. Details: the **research-trees** and **campaign-characters** skills.
