# Storylines — Agent Notes

Campaign content lives under per-storyline folders (e.g. `WorldOfDarkness/` — see its `AGENTS.md`). QuestDefs for WoD are in `WorldOfDarkness/quests/` (`quests/AGENTS.md`); shared quest runtime is the `quest*.ts` modules in this folder.

## Mission definition pattern

`BaseMissionDef` (abstract class) and `IBaseMissionDef` (interface) are both declared in
`BaseMissionDef.ts` but serve different roles:

- Missions **subclass** `BaseMissionDef`
- `BattleSession` and `MISSION_MAP` type things as **`IBaseMissionDef`**

**When adding a new optional field to missions, add it to both** the interface (`IBaseMissionDef`)
and the class body (`BaseMissionDef`). Adding it to the class only compiles fine, but the field
will be `undefined` wherever `IBaseMissionDef` is used — including `BattleSession` — causing
silent runtime failures with no error message.

Layout-composer fields (`mapLayout`, `spawnSegmentId`, `composeMap`, `getFetchSegmentIds`) follow
the same rule. Verify with `npx tsc --noEmit` after making the change.
