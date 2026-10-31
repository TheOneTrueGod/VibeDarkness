# Conjured Weapons

Engine support for a weapon an ability conjures: while held it swaps the unit's weapon abilities for a held strike and a release ability, and when it ends it can leave a token on the ground. The engine owns the definition and the runtime; content (today the Armory, `card_defs/10_armory_core/register.ts`) registers its weapons. Engine code never imports content (`game/contentLayering.test.ts`).

| File | Owns |
|---|---|
| `registry.ts` | `ConjuredWeaponDef`: the weapon id (saved on the unit as the held weapon), the conjure / held / release ability ids, held uses, the token kind (saved on the dropped token, so it differs from the weapon id and neither may be renamed) and `art`, the upright picture used by the orbit, the discard arc and the token. Looked up by id or by token kind. Also the held-weapon instance state, which is serialized on the unit. |
| `runtime.ts` | Equipping, releasing (with or without a token) and ending a held weapon when its uses run out. |

To add a weapon: register a def from the content's `register.ts`, and build the abilities with the `defineConjure` / `defineThrownWeapon` archetypes in `abilities/archetypes/`. `abilities/archetypes/defineThrownWeapon.test.ts` is a second weapon built with no Armory code. Token flight and the dropped-weapon picture are in `../fieldObjects/AGENTS.md`.
