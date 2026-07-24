# DarknessStrength

Campaign meta-progression packages that raise battle difficulty. Defs live in a static registry; campaign saves only instance crumbs and admin overrides. Resolve → compile into enemy/player stat bags, world modifiers, and spawn tweaks. Mission-end progression updates campaign instances (victory duration decrement + promoted tallies).

| Path | Owns |
|------|------|
| `types.ts` | Package / instance / override / compile-effect / `UnitFilter` shapes |
| `unitFilter.ts` | AND matching for `characterId` / `creatureType` / tags |
| `registry.ts` | `getDarknessStrength` / `listDarknessStrengths` |
| `campaignFields.ts` | API defaults / PATCH keys for campaign DarknessStrength fields |
| `resolve.ts` | Active set from instances + region/mission ids + admin overrides |
| `compile.ts` | `compileStatBags` / bake `statBuff` onto units at spawn; spawnTweaks → WM |
| `progression.ts` | Mission-end: victory `battlesRemaining` decrement/remove; merge `{ packageId, dataDelta }` promotions |
| `packages/` | Authored package defs (starters first) |

See `docs/plans/darkness-strength.md` for the full architecture. Mirror research passive merge math from `app/js/researchTrees/passiveBonuses.ts` when compiling `statBuff`. Enemy bags bake in `spawnUnit` via `engine.activeDarknessStrengths`; player bags merge in `BaseMissionDef` before research HP/damage bake. Host applies `applyMissionEndDarknessStrengthProgression` via campaign PATCH at mission end only (never mid-battle); remove instance when `battlesRemaining` hits 0.
