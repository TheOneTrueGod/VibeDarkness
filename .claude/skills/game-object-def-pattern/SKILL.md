---
name: game-object-def-pattern
description: Explains when a game object property belongs on its type definition (def-based) vs on the serialized instance. Covers the getter-delegates-to-def pattern, where to add the property, and how to wire up the accessor. Use when adding properties to Units, Projectiles, SpecialTiles, Buffs, or any other serialized game objects.
---

# Game Object Def-Pattern

Every property on a serialized game object belongs in one of two places:

| Category | Lives on | Serialized? | Accessed via |
|---|---|---|---|
| **Def-based** | The `*Def` / `*Entry` type | No | Getter on game object → accessor fn → def registry |
| **Instance-based** | The game object class/struct | Yes (in `toJSON`/`fromJSON`) | Direct field |

## Decision Rule

> "Is this value always the same for every instance of this character/type, determined entirely by its type identifier?"

- **Yes** → def-based. Put it in the def, expose via getter.
- **No** (it can differ between two instances of the same type at runtime, e.g. current HP, active buffs, patrol leg) → instance-based. Serialize it.

## Unit / UnitDef — the canonical example

The Unit def registry lives in `app/js/games/minion_battles/game/units/unit_defs/unitDef.ts`.

- `UnitDefEntry` is the exported type for a per-character static definition. Extend it here when adding a def-based property.
- `UNIT_DEFS` is the `Record<UnitDefId, UnitDefEntry>` registry. Add the value for each character here.
- Accessor functions (`getUnitCombatCcDef`, `getUnitEnrageDef`, etc.) are exported from this file. Add one per def-based property.

**Pre-existing examples of the getter pattern on `Unit`:**
- `knockbackResistance` — `get knockbackResistance()` delegates to `getUnitCombatCcDef(this.characterId)`
- `enrageDef` — `get enrageDef()` delegates to `getUnitEnrageDef(this.characterId)`

Both have no backing field and do not appear in `toJSON`/`fromJSON`.

## Adding a new def-based property (any game object)

1. **Extend the def type** — add the optional field to `*DefEntry` / `*Def`
2. **Populate the registry** — add the value in the relevant registry entries
3. **Add an accessor function** — `export function get<Object><Property>(typeId: string): T | undefined`
4. **Add a getter on the game object** — delegates to the accessor; no backing field
5. **Do not touch serialization** — omit from `toJSON`, `fromJSON`, spawn configs, and factory parameters

## Adding an instance-based property

Add it as a regular class field, serialize it in `toJSON`/`fromJSON`, and include it in the spawn/creation config if it needs to be set at creation time.

## Backward compatibility when migrating a field from instance to def

When removing a previously serialized field (e.g. `enrageDef` migration):
- Delete it from `toJSON` so new checkpoints omit it.
- Remove the restore block from `fromJSON` — old payloads that still carry the field are silently ignored; the getter provides the value from the def.
- No explicit migration needed for existing saves.

## Static constructor for serialized data (`fromSerialized`)

When constructing a client-side game object from data received from the server (checkpoint, sync packet, JSON roundtrip), use a static factory method named `fromSerialized`:

```typescript
static fromSerialized(data: SomeSerialized): SomeClass { … }
```

- The method name is `fromSerialized` (not `fromJSON`, not `fromData`).
- It accepts the serialized shape, performs any type narrowing needed (e.g. `data as SomeSubtype`), and returns a fully-constructed instance.
- Use `?? fallback` for fields added after initial release to ensure backward compatibility with older saves.
- The registry or deserializer that wires this into the broader system calls `SomeClass.fromSerialized(data)`.

**Pre-existing examples:**
- `ExposedBuff.fromSerialized` (`app/js/games/minion_battles/buffs/ExposedBuff.ts`) — restores `maxExposedDuration` and `exposedResistance` from the serialized buff payload.

Existing buffs (`StunnedBuff`, `BleedBuff`, `CantDieBuff`) still use `fromJSON`; migrate them to `fromSerialized` when touched.
