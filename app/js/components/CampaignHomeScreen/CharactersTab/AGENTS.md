# CharactersTab/

Campaign-home character sheet. LayerOne owns chrome and inner-tab routing; LayerTwo renders the selected tab body.

## Folder map

| Area | Purpose |
|------|---------|
| `MissionMap/` | Mission Map tab body (wraps the existing map implementation). |
| `Upgrades/` | Upgrades / research tab body wrapper. |
| `StatBonuses/` | Stat Bonuses tab body. |
| `Equipment/` | Admin Equipment tab body wrapper. |
| `CharactersTabLayerOne.tsx` | Name, portrait arrows, Change Characters, left-column switch, inner-tab bar. |
| `CharactersTabLayerTwo.tsx` | Right panel: switches on the routed inner tab. |
| `useCharacterInnerTab.ts` | URL `/players/:id/characters/:charId/:tab`; missing tab defaults to map. |

Inner-tab slugs live in `app/js/components/ability-tests/campaignTabPaths.ts`.
