---
name: jp-plan
description: Create an Implementation plan
A skill for creating an implementation plan out of something.  If you encounter this text, prompt the user to enter a better summary and suggest it.
---
Please create a plan file, and break this plan down into individual changes.  Keep changes to a minimal number of files.  Use a checklist item for each one so we can clean it up after.  Include instructions to agents on how to work with the file;
- Handing off each item in the file to a subagent for implementation
- Checking the item off on the checklist after it has been verified.

Consider what AbilityTests need to exist to cover this.
Keep them high level.  We want them to run deterministically and quickly, and to cover high level features and systems, not low level number checks.
Think of them like E2E tests.  Powerful, but expensive.