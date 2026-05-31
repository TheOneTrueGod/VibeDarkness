# Completed Todos

## Trivial

| Todo | Notes | Date |
|------|-------|------|

## Easy

| Todo | Notes | Date |
|------|-------|------|

## Medium

| Todo | Notes | Date |
|------|-------|------|
| Move enrageDef from Unit instance onto unitDef | Extracted inline UNIT_DEFS type to exported `UnitDefEntry`, added `enrageDef` to it and the `alpha_wolf` entry, replaced the Unit backing field with a getter delegating to `getUnitEnrageDef()`, removed from `toJSON`/`fromJSON` and all spawn configs. Also created `game-object-def-pattern` skill documenting the def-based vs instance-based property classification rule. | 2026-05-31 |

## Hard

| Todo | Notes | Date |
|------|-------|------|
