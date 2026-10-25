/**
 * Registers the built-in component types in a fixed order (serialization order). Imported by `Unit.ts` so any code that
 * creates or restores a unit sees every component type. Append new components here; do not reorder shipped ones.
 */
import './lanterniteComponent';
import './swarmComponent';
import './petComponent';
