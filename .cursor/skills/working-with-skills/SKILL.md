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
