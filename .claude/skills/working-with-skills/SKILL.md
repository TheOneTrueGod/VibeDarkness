---
name: working-with-skills
description: Project conventions for creating and editing skill files in VibeDarkness. Use when creating, editing, splitting, or relocating a SKILL.md file.
---

# Working with Skills

## Length

Skill files must stay **under 200 lines**.

If a skill would exceed that limit, split it into smaller focused skills and reference them from the parent:

```markdown
For reusable terrain, see the **map-segments** skill.
```

## Location

Place skills close to the code they describe:

| Scope | Location |
|-------|----------|
| General / cross-cutting | `.cursor/skills/<skill-name>/SKILL.md` |
| Specific to a codebase section | Highest shared folder that contains the relevant code |

When code is primarily in one area but referenced elsewhere, co-locate the skill with the primary area.

**Example:** A skill about GameObjects that live under `app/js/games/minion_battles/game/` should be placed in (or near) that folder, even if the backend has a few references to them.

## Code Examples in Skills

Avoid embedding specific code examples or listing out specific variable values (like enums) in skill files. Instead, direct the reader to the files or folders where examples can be found:

```markdown
# Good
See existing abilities under `card_defs/` for reference implementations.

# Bad
AbilityGroupId values: Warrior = 1, Ranger = 2, Mage = 3, Healer = 4
```

This prevents skills from becoming stale as the codebase evolves. The source of truth should remain in the code itself.

## Minion Battles abilities: tags

When a skill touches Minion Battles **abilities**, it should **mention that abilities can have typed `tags`** (separate from structured `keywords` such as exhaust) and **send the reader to the implementation** instead of listing tag ids or hint text:

- `app/js/games/minion_battles/abilities/Ability.ts` — `AbilityTag` on `AbilityStatic`, tag resolution helpers
- `app/js/games/minion_battles/abilities/abilityTagCatalog.ts` — per-tag **hint** copy and optional typed **catalog settings**
- `app/js/games/minion_battles/abilities/abilityUses.ts` — recovery charge distribution respects tag behaviour (e.g. priority)

Follow the same rule as above: **do not paste tag unions or catalog strings into skills**; reference these files so the skill stays accurate as tags evolve.

## Minion Battles: new skill trees (ability groups)

When adding or reorganizing a **thematic line of cards** (a new skill tree):

1. Add a **`AbilityGroupId`** entry in `app/js/games/minion_battles/card_defs/AbilityGroupId.ts` (source of truth for the first two digits of 4-digit ids). Use `formatGroupId()` when composing ids in TypeScript.
2. Co-locate all related `card_defs` under **`app/js/games/minion_battles/card_defs/<tree_folder>/`** (see `05_earth_core/` and `utility/` for folder layout and import depth). For Earth (**`05`**), read `05_earth_core/EarthCore.md` when changing that line. Do not scatter one tree across unrelated top-level folders.
3. Follow **`app/js/games/minion_battles/card_defs/SKILL.md`** for id rules, registration, and `abilityTimings`; keep this skill free of duplicated numeric assignments.

## Verification after code edits

When a skill tells the agent to run tests after changing application code, match the workspace **post-change** hook (`.cursor/rules/post-change-test-hook.mdc`) and **scoped-testing** skill (`.cursor/skills/scoped-testing/SKILL.md`): **`npm run lint:changed`** before Vitest (not full `npm run lint`); post the green **Starting unit tests** line (see scoped-testing) immediately before each Vitest run; run the **minimal** relevant tests, not the full suite unless cross-cutting or the user asks. **`npm run ci`** is the periodic full-suite + lint + `tsc` backstop.

## Structure

Every skill needs YAML frontmatter with `name` and `description`:

```markdown
---
name: my-skill-name
description: What the skill does and when to use it.
---
```

- `name`: lowercase letters, numbers, and hyphens only (max 64 chars)
- `description`: explain **what** and **when**, written in third person (max 1024 chars)
- Keep content concise — only include context the agent wouldn't already know
