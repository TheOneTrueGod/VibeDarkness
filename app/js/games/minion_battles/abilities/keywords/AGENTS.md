# abilities/keywords/

Reusable ability keywords: a keyword is a named definition (`id`, display name, tooltip text, optional cast-time `resolve`) that an ability attaches via `keywordUses` with an optional effect that runs only when the keyword triggers. This replaces hand-written `{Bright 3}` / `{knockback 1}` tooltip strings and ad-hoc cast logic.

## Folder map

| Path | Owns |
|------|------|
| `keywordTypes.ts` | `KeywordId`, `KeywordDef`, `AbilityKeywordUse`, and the cast-time context/result types. Add new ids here. |
| `keywordRegistry.ts` | Registers every keyword def; `getKeyword` / `formatKeywordText` / `formatKeywordLine` lookups. A def not registered here is invisible to tooltips and the runner. |
| `runAbilityKeywords.ts` | `runAbilityKeywords` (resolves uses in order, runs `effect` only when triggered) and `formatKeywordUseTooltip` (`{Name N}` or `{Name N}: effect`). |
| `devourLightKeyword.ts` | `devourLight` def: destroys the N nearest positive light sources near the caster, all-or-nothing. Finds targets with `findDeployables` (own-team `lightEmitter` deployables within the 5x5 reach) and consumes them via `consumeDeployable`; see `game/deployables/AGENTS.md`. |

## Registered keywords

| Id | Cast-time behaviour |
|----|---------------------|
| `bright` | Spawns a bright light source via `abilities/brightKeyword.ts`. |
| `knockback` | Tooltip only; tier logic stays in `crowdControl/knockbackKeywords.ts`. |
| `devourLight` | Consumes nearby own-team light-emitter deployables; triggers only if enough exist. |

## Adding a keyword

Add the id to `KeywordId`, create `<name>Keyword.ts` exporting a `KeywordDef`, register it in `keywordRegistry.ts`, and add a co-located test. Abilities attach it with the `keywordUses` field (not `keywords`, which is the nested-card lifecycle map) and call `runAbilityKeywords` in the timing where it should fire — order relative to other cast effects matters (e.g. Gather Light devours before spawning its own light). Tooltip style: see `writing-style-abilities` `STYLE.md`. Parent: `abilities/AGENTS.md`.
